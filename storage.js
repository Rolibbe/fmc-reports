// storage.js
// Funciones separadas desde app.js para mantener la PWA mas facil de mantener.

const masterDataCache = {
  companyCraneRegistry: {},
  companyMaintenanceFrequencies: {},
  companyContacts: {},
  companyLocations: {},
  activeCraneFindings: {},
  deletedCompanyCranes: {},
  deletedInspections: {},
  deletedCompanies: {},
  auditLog: [],
  workOrders: {}
};

async function initializeMasterDataStore() {
  const sources = [
    { cacheKey: "companyCraneRegistry", storageKey: COMPANY_CRANE_REGISTRY_KEY, fallback: {} },
    { cacheKey: "companyMaintenanceFrequencies", storageKey: COMPANY_MAINTENANCE_FREQUENCY_KEY, fallback: {} },
    { cacheKey: "companyContacts", storageKey: COMPANY_CONTACTS_KEY, fallback: {} },
    { cacheKey: "companyLocations", storageKey: COMPANY_LOCATIONS_KEY, fallback: {} },
    { cacheKey: "activeCraneFindings", storageKey: ACTIVE_CRANE_FINDINGS_KEY, fallback: {} },
    { cacheKey: "deletedCompanyCranes", storageKey: DELETED_COMPANY_CRANES_KEY, fallback: {} },
    { cacheKey: "deletedInspections", storageKey: DELETED_INSPECTIONS_KEY, fallback: {} },
    { cacheKey: "deletedCompanies", storageKey: DELETED_COMPANIES_KEY, fallback: {} },
    { cacheKey: "auditLog", storageKey: AUDIT_LOG_KEY, fallback: [] },
    { cacheKey: "workOrders", storageKey: WORK_ORDERS_KEY, fallback: {} }
  ];

  for (const source of sources) {
    try {
      const storedValue = await getMasterDataValue(source.storageKey);
      if (storedValue && (typeof storedValue === "object" || Array.isArray(storedValue))) {
        masterDataCache[source.cacheKey] = storedValue;
        continue;
      }
    } catch (error) {
      // Si IndexedDB no esta disponible, seguimos con datos legacy en memoria.
    }

    const legacyValue = readLegacyJsonValue(source.storageKey, source.fallback);
    masterDataCache[source.cacheKey] = legacyValue;
    try {
      await putMasterDataValue(source.storageKey, legacyValue);
      clearLegacyJsonValue(source.storageKey);
    } catch (error) {
      // Mantener la app utilizable aunque el navegador bloquee IndexedDB.
    }
  }
}

function getCachedMasterData(cacheKey) {
  const value = masterDataCache[cacheKey];
  if (Array.isArray(value)) {
    return value;
  }
  return value && typeof value === "object" ? value : {};
}

function setCachedMasterData(cacheKey, storageKey, value) {
  const normalizedValue = Array.isArray(value)
    ? value
    : value && typeof value === "object"
      ? value
      : {};
  masterDataCache[cacheKey] = normalizedValue;
  return putMasterDataValue(storageKey, normalizedValue).catch(() => {
    if (typeof elements !== "undefined" && elements.connectionStatus) {
      elements.connectionStatus.textContent = "Los cambios locales se hicieron, pero no se pudo actualizar IndexedDB.";
    }
  });
}

function readLegacyJsonValue(key, fallback) {
  try {
    const parsed = JSON.parse(localStorage.getItem(key) || "null");
    return parsed && typeof parsed === "object" ? parsed : fallback;
  } catch (error) {
    return fallback;
  }
}

function clearLegacyJsonValue(key) {
  try {
    localStorage.removeItem(key);
  } catch (error) {
    // No es critico: IndexedDB ya queda como fuente principal.
  }
}

let databasePromise = null;

function openDatabase() {
  if (databasePromise) {
    return databasePromise;
  }

  databasePromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains(MASTER_DATA_STORE_NAME)) {
        db.createObjectStore(MASTER_DATA_STORE_NAME, { keyPath: "key" });
      }
      if (!db.objectStoreNames.contains(CRANE_FINDINGS_STORE_NAME)) {
        const findingStore = db.createObjectStore(CRANE_FINDINGS_STORE_NAME, { keyPath: "id" });
        // "scope" es empresa|grua: con el se saca la bitacora de una grua sin
        // recorrer todos los hallazgos de todas las empresas.
        findingStore.createIndex("scope", "scope", { unique: false });
        findingStore.createIndex("client", "client", { unique: false });
      }
    };

    request.onsuccess = () => {
      const db = request.result;
      // Si otra pestana necesita subir de version, esta hay que soltarla o la
      // deja bloqueada. La siguiente operacion vuelve a abrir.
      db.onversionchange = () => {
        db.close();
        databasePromise = null;
      };
      db.onclose = () => {
        databasePromise = null;
      };
      resolve(db);
    };

    request.onerror = () => {
      databasePromise = null;
      reject(request.error);
    };
  });

  return databasePromise;
}

async function withStore(mode, callback) {
  return withObjectStore(STORE_NAME, mode, callback);
}

async function runStoreOperation(storeName, mode, callback) {
  const db = await openDatabase();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(storeName, mode);
    const store = transaction.objectStore(storeName);
    const request = callback(store);

    transaction.oncomplete = () => resolve(request ? request.result : undefined);
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error);
  });
}

async function withObjectStore(storeName, mode, callback) {
  try {
    return await runStoreOperation(storeName, mode, callback);
  } catch (error) {
    // Si la conexion quedo cerrada, se reabre una vez y se reintenta. Sin esto,
    // reusar la conexion haria fallar todo lo que venga despues.
    const cerrada = error && (error.name === "InvalidStateError" || error.name === "TransactionInactiveError");
    if (!cerrada) {
      throw error;
    }
    databasePromise = null;
    return runStoreOperation(storeName, mode, callback);
  }
}

// Los reportes traen las fotos dentro, asi que leerlos todos cuesta decenas
// de MB. Entrar a Empresas encadena siete lecturas de la misma informacion
// (directorio, fechas, severidad, resumen...) y cada una volvia a la base.
//
// Se guarda el resultado y se tira en cuanto algo escribe. Toda escritura pasa
// por este archivo, asi que no hay forma de que quede una copia vieja.
let inspectionsCache = null;
let inspectionsInFlight = null;

function invalidateInspectionsCache() {
  inspectionsCache = null;
  inspectionsInFlight = null;
}

async function putInspection(record) {
  invalidateInspectionsCache();
  return withStore("readwrite", (store) => store.put(record));
}

async function getInspection(id) {
  return withStore("readonly", (store) => store.get(id));
}

async function getAllInspections() {
  if (inspectionsCache) {
    return inspectionsCache;
  }
  // Varias pantallas piden la lista a la vez al arrancar. Sin compartir la
  // promesa se dispararian lecturas simultaneas de lo mismo.
  if (!inspectionsInFlight) {
    inspectionsInFlight = withStore("readonly", (store) => store.getAll())
      .then((records) => {
        inspectionsCache = Array.isArray(records) ? records : [];
        inspectionsInFlight = null;
        return inspectionsCache;
      })
      .catch((error) => {
        inspectionsInFlight = null;
        throw error;
      });
  }
  return inspectionsInFlight;
}

async function deleteInspection(id) {
  invalidateInspectionsCache();
  return withStore("readwrite", (store) => store.delete(id));
}

async function clearAllInspections() {
  invalidateInspectionsCache();
  return withStore("readwrite", (store) => store.clear());
}

async function getMasterDataValue(key) {
  const record = await withObjectStore(MASTER_DATA_STORE_NAME, "readonly", (store) => store.get(key));
  return record ? record.value : undefined;
}

// --------------------------------------------------------------------------
// Bitacora de hallazgos. Cada hallazgo se guarda y se actualiza solo,
// sin tocar a los demas.
// --------------------------------------------------------------------------

async function getAllCraneFindings() {
  return withObjectStore(CRANE_FINDINGS_STORE_NAME, "readonly", (store) => store.getAll());
}

async function putCraneFinding(record) {
  return withObjectStore(CRANE_FINDINGS_STORE_NAME, "readwrite", (store) => store.put(record));
}

async function deleteCraneFindingRecord(id) {
  return withObjectStore(CRANE_FINDINGS_STORE_NAME, "readwrite", (store) => store.delete(id));
}

async function putMasterDataValue(key, value) {
  return withObjectStore(MASTER_DATA_STORE_NAME, "readwrite", (store) => store.put({ key, value }));
}
