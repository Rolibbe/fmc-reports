// storage.js
// Funciones separadas desde app.js para mantener la PWA mas facil de mantener.

const masterDataCache = {
  companyCraneRegistry: {},
  companyMaintenanceFrequencies: {},
  companyContacts: {},
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

function openDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains(MASTER_DATA_STORE_NAME)) {
        db.createObjectStore(MASTER_DATA_STORE_NAME, { keyPath: "key" });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function withStore(mode, callback) {
  return withObjectStore(STORE_NAME, mode, callback);
}

async function withObjectStore(storeName, mode, callback) {
  const db = await openDatabase();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(storeName, mode);
    const store = transaction.objectStore(storeName);
    const request = callback(store);

    transaction.oncomplete = () => resolve(request ? request.result : undefined);
    transaction.onerror = () => reject(transaction.error);
  });
}

async function putInspection(record) {
  return withStore("readwrite", (store) => store.put(record));
}

async function getInspection(id) {
  return withStore("readonly", (store) => store.get(id));
}

async function getAllInspections() {
  return withStore("readonly", (store) => store.getAll());
}

async function deleteInspection(id) {
  return withStore("readwrite", (store) => store.delete(id));
}

async function clearAllInspections() {
  return withStore("readwrite", (store) => store.clear());
}

async function getMasterDataValue(key) {
  const record = await withObjectStore(MASTER_DATA_STORE_NAME, "readonly", (store) => store.get(key));
  return record ? record.value : undefined;
}

async function putMasterDataValue(key, value) {
  return withObjectStore(MASTER_DATA_STORE_NAME, "readwrite", (store) => store.put({ key, value }));
}
