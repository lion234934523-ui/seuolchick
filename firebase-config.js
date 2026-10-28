/**
 * ============================================================================
 * SEOUL CHICK — FIREBASE & DATABASE SYNCHRONIZATION MODULE
 * ============================================================================
 * Ushbu modul mijoz sayti (index.html) va Admin panel (admin.html) o'rtasida
 * real vaqt rejimida (Real-time) buyurtmalar va menyuni sinxronlashtiradi.
 * 
 * Agar Firebase kalitlari kiritilmagan bo'lsa, tizim avtomatik ravishda
 * Lokal Rejimda (localStorage) to'liq ishlaydi.
 */

// 1. Standart Firebase konfiguratsiyasi
const DEFAULT_FIREBASE_CONFIG = {
  apiKey: "",
  authDomain: "",
  projectId: "",
  storageBucket: "",
  messagingSenderId: "",
  appId: ""
};

// Lokal xotiradan saqlangan konfiguratsiyani olish (agar admin paneldan kiritilgan bo'lsa)
function getSavedFirebaseConfig() {
  try {
    const saved = localStorage.getItem('seoul_chick_firebase_config');
    if (saved) {
      const parsed = JSON.parse(saved);
      if (parsed.apiKey && parsed.projectId) {
        return parsed;
      }
    }
  } catch(e) {
    console.warn("Firebase config o'qishda xatolik:", e);
  }
  return DEFAULT_FIREBASE_CONFIG;
}

let activeFirebaseConfig = getSavedFirebaseConfig();
let db = null;
let isFirebaseConnected = false;

// 2. Firebase-ni initsializatsiya qilish
function initSeoulFirebase() {
  if (typeof firebase === 'undefined') {
    console.info("ℹ️ Firebase SDK yuklanmagan yoki lokal rejimda ishlanmoqda.");
    return false;
  }

  const cfg = activeFirebaseConfig;
  if (!cfg.apiKey || !cfg.projectId || cfg.apiKey.includes("YOUR_")) {
    console.info("ℹ️ Firebase sozlanmagan. Tizim Demo / LocalStorage rejimida ishlaydi.");
    return false;
  }

  try {
    if (!firebase.apps.length) {
      firebase.initializeApp(cfg);
    }
    db = firebase.firestore();
    isFirebaseConnected = true;
    console.log("🔥 Firebase Firestore muvaffaqiyatli ulandi! Loyiha:", cfg.projectId);
    return true;
  } catch (err) {
    console.error("Firebase ulanish xatosi:", err);
    isFirebaseConnected = false;
    return false;
  }
}

// 3. BUYURTMANI SAQLASH (Mijoz buyurtma berganda chaqiriladi)
async function saveOrderToDatabase(orderData) {
  const finalOrder = {
    ...orderData,
    status: orderData.status || 'yangi', // yangi | tayyorlanmoqda | yetkazilmoqda | bajarildi | bekor
    createdAt: firebase?.firestore?.FieldValue?.serverTimestamp ? 
      (isFirebaseConnected ? firebase.firestore.FieldValue.serverTimestamp() : new Date().toISOString()) : 
      new Date().toISOString(),
    timestampMs: Date.now()
  };

  // 3.1. Agar Firebase ulangan bo'lsa
  if (isFirebaseConnected && db) {
    try {
      const docRef = await db.collection("orders").add(finalOrder);
      console.log("✅ Buyurtma Firestore-ga saqlandi ID bilan:", docRef.id);
      finalOrder.id = docRef.id;
    } catch (e) {
      console.error("Firestore-ga yozishda xatolik:", e);
      // Xatolik bo'lsa zaxiraga lokal saqlaymiz
      saveOrderToLocalStorage(finalOrder);
    }
  } else {
    // 3.2. Lokal rejimda saqlash
    saveOrderToLocalStorage(finalOrder);
  }

  // Boshqa ochiq tablarni ogohlantirish (localStorage hodisasi)
  try {
    localStorage.setItem('seoul_chick_new_order_event', JSON.stringify({
      orderId: finalOrder.orderNum || finalOrder.id,
      timestamp: Date.now()
    }));
  } catch (e) {}

  return finalOrder;
}

// Lokal xotiraga buyurtma saqlash (Offline / Demo zaxira)
function saveOrderToLocalStorage(order) {
  try {
    const orders = getOrdersFromLocalStorage();
    order.id = order.id || ('local_' + Date.now());
    orders.unshift(order);
    localStorage.setItem('seoul_chick_orders', JSON.stringify(orders));
    console.log("💾 Buyurtma Lokal xotiraga (localStorage) saqlandi.");
  } catch (e) {
    console.warn("Lokal saqlashda xatolik:", e);
  }
}

function getOrdersFromLocalStorage() {
  try {
    const raw = localStorage.getItem('seoul_chick_orders');
    return raw ? JSON.parse(raw) : [];
  } catch(e) {
    return [];
  }
}

// 4. BUYURTMALARNI TINGLASH (Admin panel uchun real-time)
function subscribeToOrders(callback) {
  if (isFirebaseConnected && db) {
    console.log("📡 Firestore 'orders' kolleksiyasiga real-time ulanildi...");
    return db.collection("orders")
      .orderBy("timestampMs", "desc")
      .onSnapshot((snapshot) => {
        const orders = [];
        snapshot.forEach((doc) => {
          orders.push({ id: doc.id, ...doc.data() });
        });
        callback(orders);
      }, (err) => {
        console.error("Firestore buyurtmalarini tinglashda xato:", err);
        // Fallback to local
        callback(getOrdersFromLocalStorage());
      });
  } else {
    // Lokal rejimda listener
    console.log("📡 Lokal rejim: buyurtmalar localStorage orqali o'qilmoqda...");
    callback(getOrdersFromLocalStorage());
    
    const handler = (e) => {
      if (e.key === 'seoul_chick_orders' || e.key === 'seoul_chick_new_order_event') {
        callback(getOrdersFromLocalStorage());
      }
    };
    window.addEventListener('storage', handler);
    return () => window.removeEventListener('storage', handler);
  }
}

// 5. BUYURTMA STATUSINI O'ZGARTIRISH
async function updateOrderStatus(orderId, newStatus) {
  if (isFirebaseConnected && db && !orderId.startsWith('local_')) {
    try {
      await db.collection("orders").doc(orderId).update({
        status: newStatus,
        updatedAt: new Date().toISOString()
      });
      console.log(`✅ Buyurtma ${orderId} holati o'zgartirildi: ${newStatus}`);
      return true;
    } catch(e) {
      console.error("Statusni Firestore-da yangilashda xato:", e);
    }
  }

  // Lokal yangilash
  const orders = getOrdersFromLocalStorage();
  const idx = orders.findIndex(o => (o.id === orderId || o.orderNum === orderId));
  if (idx > -1) {
    orders[idx].status = newStatus;
    orders[idx].updatedAt = new Date().toISOString();
    localStorage.setItem('seoul_chick_orders', JSON.stringify(orders));
    // Trigger storage event
    localStorage.setItem('seoul_chick_status_update_event', Date.now());
    return true;
  }
  return false;
}

// 6. BUYURTMANI O'CHIRISH
async function deleteOrderFromDatabase(orderId) {
  if (isFirebaseConnected && db && !orderId.startsWith('local_')) {
    try {
      await db.collection("orders").doc(orderId).delete();
      return true;
    } catch (e) {
      console.error("Firestore-dan o'chirishda xatolik:", e);
    }
  }

  const orders = getOrdersFromLocalStorage();
  const filtered = orders.filter(o => o.id !== orderId && o.orderNum !== orderId);
  localStorage.setItem('seoul_chick_orders', JSON.stringify(filtered));
  localStorage.setItem('seoul_chick_status_update_event', Date.now());
  return true;
}

// 7. MENYU STOP-LIST VA NARX SOZLAMALARI
function getStopListFromStorage() {
  try {
    const raw = localStorage.getItem('seoul_chick_stoplist');
    return raw ? JSON.parse(raw) : {};
  } catch(e) {
    return {};
  }
}

async function setItemStopListStatus(dishId, isOutOfStock) {
  const stopList = getStopListFromStorage();
  stopList[dishId] = !!isOutOfStock;
  localStorage.setItem('seoul_chick_stoplist', JSON.stringify(stopList));

  if (isFirebaseConnected && db) {
    try {
      await db.collection("settings").doc("stoplist").set(stopList, { merge: true });
    } catch(e) {
      console.warn("Firestore stop-list sinxronizatsiyasida xato:", e);
    }
  }

  localStorage.setItem('seoul_chick_stoplist_event', Date.now());
  return stopList;
}

function subscribeToStopList(callback) {
  if (isFirebaseConnected && db) {
    return db.collection("settings").doc("stoplist").onSnapshot(doc => {
      if (doc.exists) {
        const data = doc.data() || {};
        localStorage.setItem('seoul_chick_stoplist', JSON.stringify(data));
        callback(data);
      } else {
        callback(getStopListFromStorage());
      }
    }, err => {
      callback(getStopListFromStorage());
    });
  } else {
    callback(getStopListFromStorage());
    const handler = (e) => {
      if (e.key === 'seoul_chick_stoplist' || e.key === 'seoul_chick_stoplist_event') {
        callback(getStopListFromStorage());
      }
    };
    window.addEventListener('storage', handler);
    return () => window.removeEventListener('storage', handler);
  }
}

// 8. YANGI TOVARLAR, RASMLAR VA CHEGIRMALAR BOSHQARUVI (MENU CRUD)
function getCustomMenuFromStorage() {
  try {
    const raw = localStorage.getItem('seoul_chick_custom_menu');
    return raw ? JSON.parse(raw) : {};
  } catch(e) {
    return {};
  }
}

async function saveCustomDish(dishData) {
  const menuMap = getCustomMenuFromStorage();
  dishData.updatedAt = Date.now();
  menuMap[dishData.id] = dishData;
  localStorage.setItem('seoul_chick_custom_menu', JSON.stringify(menuMap));

  if (isFirebaseConnected && db) {
    try {
      await db.collection("menu").doc(dishData.id).set(dishData, { merge: true });
      console.log("✅ Taom Firestore 'menu' ga saqlandi:", dishData.id);
    } catch(e) {
      console.warn("Firestore menu saqlashda xato:", e);
    }
  }

  localStorage.setItem('seoul_chick_menu_event', Date.now());
  return dishData;
}

async function deleteCustomDish(dishId) {
  const menuMap = getCustomMenuFromStorage();
  menuMap[dishId] = {
    ...(menuMap[dishId] || {}),
    id: dishId,
    deleted: true,
    updatedAt: Date.now()
  };
  localStorage.setItem('seoul_chick_custom_menu', JSON.stringify(menuMap));

  if (isFirebaseConnected && db) {
    try {
      await db.collection("menu").doc(dishId).set({
        id: dishId,
        deleted: true,
        updatedAt: Date.now()
      }, { merge: true });
    } catch(e) {
      console.warn("Firestore menu o'chirishda xato:", e);
    }
  }

  localStorage.setItem('seoul_chick_menu_event', Date.now());
  return true;
}

async function restoreCustomDish(dishId) {
  const menuMap = getCustomMenuFromStorage();
  if (menuMap[dishId]) {
    delete menuMap[dishId].deleted;
    menuMap[dishId].updatedAt = Date.now();
    localStorage.setItem('seoul_chick_custom_menu', JSON.stringify(menuMap));
  }

  if (isFirebaseConnected && db) {
    try {
      await db.collection("menu").doc(dishId).set({
        deleted: false,
        updatedAt: Date.now()
      }, { merge: true });
    } catch(e) {
      console.warn("Firestore menu tiklashda xato:", e);
    }
  }

  localStorage.setItem('seoul_chick_menu_event', Date.now());
  return true;
}

function subscribeCustomMenu(callback) {
  if (isFirebaseConnected && db) {
    return db.collection("menu").onSnapshot(snapshot => {
      const menuMap = {};
      snapshot.forEach(doc => {
        menuMap[doc.id] = doc.data();
      });
      localStorage.setItem('seoul_chick_custom_menu', JSON.stringify(menuMap));
      callback(menuMap);
    }, err => {
      callback(getCustomMenuFromStorage());
    });
  } else {
    callback(getCustomMenuFromStorage());
    const handler = (e) => {
      if (e.key === 'seoul_chick_custom_menu' || e.key === 'seoul_chick_menu_event') {
        callback(getCustomMenuFromStorage());
      }
    };
    window.addEventListener('storage', handler);
    return () => window.removeEventListener('storage', handler);
  }
}

// Eksport qilish
window.SeoulChickDB = {
  init: initSeoulFirebase,
  isConnected: () => isFirebaseConnected,
  getConfig: () => activeFirebaseConfig,
  saveConfig: (newCfg) => {
    localStorage.setItem('seoul_chick_firebase_config', JSON.stringify(newCfg));
    activeFirebaseConfig = newCfg;
    return initSeoulFirebase();
  },
  saveOrder: saveOrderToDatabase,
  subscribeOrders: subscribeToOrders,
  updateStatus: updateOrderStatus,
  deleteOrder: deleteOrderFromDatabase,
  getStopList: getStopListFromStorage,
  setStopList: setItemStopListStatus,
  subscribeStopList: subscribeToStopList,
  getCustomMenu: getCustomMenuFromStorage,
  saveDish: saveCustomDish,
  deleteDish: deleteCustomDish,
  restoreDish: restoreCustomDish,
  subscribeMenu: subscribeCustomMenu
};

// Avto-initsializatsiya
if (typeof window !== 'undefined') {
  window.addEventListener('DOMContentLoaded', () => {
    initSeoulFirebase();
  });
}
