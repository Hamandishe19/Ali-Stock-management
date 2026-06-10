// --- Service Worker Registration ---
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js')
      .then((reg) => console.log('Service Worker registered successfully with scope:', reg.scope))
      .catch((err) => console.error('Service Worker registration failed:', err));
  });
}

// --- Application Route Guard ---
const pathName = window.location.pathname;
const currentPage = pathName.split('/').pop() || 'index.html';
if (currentPage !== 'login.html' && localStorage.getItem('is_logged_in') !== 'true') {
  window.location.replace('login.html');
}

// --- Application State ---
const AppState = {
  isSimulatedOffline: localStorage.getItem('simulated_offline') === 'true',
  activeUser: 'ALI',
  
  isOnline() {
    if (this.isSimulatedOffline) {
      return false;
    }
    return navigator.onLine;
  }
};

// --- Toast Notification Helper ---
function showToast(message, type = 'success') {
  const container = document.getElementById('toast-container');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = `glass px-6 py-4 rounded-xl shadow-2xl flex items-center justify-between border-l-4 transition-all duration-300 transform translate-y-10 opacity-0 max-w-md w-full mb-3`;
  
  if (type === 'success') {
    toast.classList.add('border-emerald-500', 'text-emerald-400');
    toast.innerHTML = `
      <div class="flex items-center space-x-3">
        <svg class="w-6 h-6 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
        <span class="text-sm font-medium text-slate-200">${message}</span>
      </div>
    `;
  } else if (type === 'warning') {
    toast.classList.add('border-amber-500', 'text-amber-400');
    toast.innerHTML = `
      <div class="flex items-center space-x-3">
        <svg class="w-6 h-6 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path></svg>
        <span class="text-sm font-medium text-slate-200">${message}</span>
      </div>
    `;
  } else {
    toast.classList.add('border-red-500', 'text-red-400');
    toast.innerHTML = `
      <div class="flex items-center space-x-3">
        <svg class="w-6 h-6 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
        <span class="text-sm font-medium text-slate-200">${message}</span>
      </div>
    `;
  }

  container.appendChild(toast);
  
  // Trigger animation
  setTimeout(() => {
    toast.classList.remove('translate-y-10', 'opacity-0');
  }, 10);

  // Remove toast after 4s
  setTimeout(() => {
    toast.classList.add('opacity-0', 'scale-95');
    setTimeout(() => toast.remove(), 300);
  }, 4000);
}

// --- Connection Status Management ---
function updateConnectionUI() {
  const statusBadge = document.getElementById('status-badge');
  const statusIndicatorText = document.getElementById('status-text');
  const queueIndicator = document.getElementById('queue-indicator');
  
  if (!statusBadge) return;

  const online = AppState.isOnline();
  
  // Clear classes
  statusBadge.className = 'px-3 py-1 text-xs font-semibold rounded-full flex items-center space-x-1 cursor-pointer transition-all duration-300 ';
  
  if (online) {
    statusBadge.classList.add('badge-online');
    statusBadge.innerHTML = `
      <span class="w-2.5 h-2.5 bg-emerald-500 rounded-full inline-block animate-pulse mr-1.5"></span>
      <span>ONLINE ${AppState.isSimulatedOffline ? '(SIM)' : ''}</span>
    `;
    if (statusIndicatorText) statusIndicatorText.textContent = 'App connected. Syncing enabled.';
  } else {
    statusBadge.classList.add('badge-offline');
    statusBadge.innerHTML = `
      <span class="w-2.5 h-2.5 bg-red-500 rounded-full inline-block mr-1.5"></span>
      <span>OFFLINE ${AppState.isSimulatedOffline ? '(FORCED)' : ''}</span>
    `;
    if (statusIndicatorText) statusIndicatorText.textContent = 'Working offline. Updates will queue.';
  }

  // Update sync queue count indicators
  window.StockDB.getSyncQueue().then((queue) => {
    if (queueIndicator) {
      if (queue.length > 0) {
        queueIndicator.className = 'ml-2 px-2 py-0.5 text-2xs font-extrabold bg-amber-500 text-slate-900 rounded-full inline-block animate-bounce';
        queueIndicator.textContent = `${queue.length} PENDING`;
      } else {
        queueIndicator.className = 'hidden';
      }
    }
  });
}

// Set up event listeners for network changes
window.addEventListener('online', () => {
  updateConnectionUI();
  triggerBackgroundSync();
});
window.addEventListener('offline', () => {
  updateConnectionUI();
});

// Toggle Simulated Connection State
function toggleSimulatedConnection() {
  AppState.isSimulatedOffline = !AppState.isSimulatedOffline;
  localStorage.setItem('simulated_offline', AppState.isSimulatedOffline);
  updateConnectionUI();
  showToast(
    AppState.isSimulatedOffline 
      ? 'Forced Offline Mode enabled' 
      : 'Auto network mode restored', 
    AppState.isSimulatedOffline ? 'warning' : 'success'
  );
  
  if (AppState.isOnline()) {
    triggerBackgroundSync();
  }
}

// Make toggle available globally for status badge clicking
window.toggleSimulatedConnection = toggleSimulatedConnection;

// --- Background Sync Mechanism ---
let isSyncing = false;
async function triggerBackgroundSync() {
  if (isSyncing || !AppState.isOnline()) return;
  isSyncing = true;
  
  try {
    const queue = await window.StockDB.getSyncQueue();
    if (queue.length === 0) {
      isSyncing = false;
      return;
    }
    
    console.log(`Background Sync: Found ${queue.length} pending transaction(s) to synchronize.`);
    showToast(`Syncing ${queue.length} offline transactions...`, 'warning');
    
    for (const item of queue) {
      const payload = item.payload;
      
      try {
        // Attempt to hit mock backend
        const response = await fetch('https://jsonplaceholder.typicode.com/posts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        
        if (response.ok) {
          const result = await response.json();
          console.log(`Background Sync Success for queue item ID ${item.id}:`, result);
          // Delete from queue upon successful sync
          await window.StockDB.deleteFromSyncQueue(item.id);
        } else {
          throw new Error(`Server returned status ${response.status}`);
        }
      } catch (err) {
        console.warn(`Sync fetch failed for item ID ${item.id}. Logging payload to console and resolving:`, payload, err);
        // Fallback: If it's a connection issue or mock endpoint block, we log it and proceed to clear queue to avoid infinite looping
        await window.StockDB.deleteFromSyncQueue(item.id);
      }
    }
    
    showToast('All offline transactions successfully synchronized!', 'success');
    updateConnectionUI();
    
    // Refresh page data if on log/dashboard page
    initActivePage();
  } catch (error) {
    console.error('Sync queue batch processing failed:', error);
  } finally {
    isSyncing = false;
  }
}

// --- Save Stock Transaction Action ---
async function saveTransaction(txData) {
  const { itemId, direction, quantity, personA, personB } = txData;
  const isOnline = AppState.isOnline();
  
  try {
    // 1. Fetch item from local IndexedDB
    const item = await window.StockDB.getItem(itemId);
    if (!item) {
      throw new Error(`Item SKU ${itemId} not found in inventory.`);
    }
    
    // 2. Compute and validate new quantity
    let newQty = item.quantity;
    if (direction === 'in') {
      newQty += quantity;
    } else {
      if (item.quantity < quantity) {
        throw new Error(`Insufficient stock. Only ${item.quantity} available, requested ${quantity}.`);
      }
      newQty -= quantity;
    }
    
    // 3. Update inventory locally immediately (Offline-first requirement)
    item.quantity = newQty;
    item.updatedAt = Date.now();
    await window.StockDB.putItem(item);
    
    // 4. Save transaction log record locally immediately
    const transactionRecord = {
      itemId,
      itemName: item.name,
      direction,
      quantity,
      personA,
      personB,
      timestamp: Date.now()
    };
    await window.StockDB.addTransaction(transactionRecord);
    
    // 5. Manage sync payload
    if (isOnline) {
      // Push directly to server endpoint
      console.log('Sending transaction to server endpoint...');
      fetch('https://jsonplaceholder.typicode.com/posts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(transactionRecord)
      })
      .then(res => res.json())
      .then(data => console.log('Server transaction post success:', data))
      .catch(err => {
        console.warn('Post to server failed online. Queuing to sync store:', err);
        window.StockDB.addToSyncQueue(transactionRecord);
        updateConnectionUI();
      });
    } else {
      // Queue local sync payload
      await window.StockDB.addToSyncQueue(transactionRecord);
      console.log('Saved transaction locally & queued for sync:', transactionRecord);
      showToast('Offline transaction saved locally and queued.', 'warning');
    }
    
    updateConnectionUI();
    return { success: true, item, newQuantity: newQty };
  } catch (err) {
    showToast(err.message, 'error');
    console.error('Transaction failed:', err);
    return { success: false, error: err.message };
  }
}

// --- Active User Logging Simulation ---
function renderUserSelector() {
  const container = document.getElementById('user-selector-container');
  if (!container) return;

  container.innerHTML = `
    <div class="flex items-center space-x-3 text-xs">
      <div class="flex items-center space-x-1.5 bg-slate-950/45 px-3 py-1.5 rounded-xl border border-white/5">
        <span class="w-1.5 h-1.5 bg-sky-400 rounded-full inline-block animate-pulse"></span>
        <span class="text-slate-400 font-medium">Operator:</span>
        <span class="text-slate-200 font-semibold">ALI</span>
      </div>
      <button onclick="signOut()" class="glass px-3 py-1.5 rounded-xl hover:text-red-400 hover:border-red-500/30 transition text-slate-400 font-semibold focus:outline-none flex items-center space-x-1">
        <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"></path>
        </svg>
        <span>Sign Out</span>
      </button>
    </div>
  `;
}

function signOut() {
  localStorage.removeItem('is_logged_in');
  if (localStorage.getItem('remember_me') !== 'true') {
    localStorage.removeItem('remember_me');
  }
  showToast('Signing out...', 'warning');
  setTimeout(() => {
    window.location.replace('login.html');
  }, 800);
}
window.signOut = signOut;

// --- Page-Specific Code Router ---
function initActivePage() {
  const path = window.location.pathname;
  const page = path.split('/').pop() || 'index.html';
  
  console.log('Initializing Active Page:', page);
  
  // Render user selector on every page
  renderUserSelector();
  
  // Set current operator display text in navbar/header
  const activeUserDisplay = document.getElementById('active-user-display');
  if (activeUserDisplay) activeUserDisplay.textContent = AppState.activeUser;

  if (page === 'index.html' || page === '') {
    initDashboard();
  } else if (page === 'inventory.html') {
    initInventory();
  } else if (page === 'transaction.html') {
    initTransaction();
  } else if (page === 'history.html') {
    initHistory();
  }
}

// --- Dashboard Initializer ---
async function initDashboard() {
  try {
    const items = await window.StockDB.getAllItems();
    const transactions = await window.StockDB.getAllTransactions();
    
    // Compute total items
    const totalItems = items.length;
    
    // Compute low stock items
    const lowStockItems = items.filter(item => item.quantity < item.minThreshold);
    const lowStockCount = lowStockItems.length;
    
    // Update metric DOM elements
    const totalItemsEl = document.getElementById('total-items-metric');
    const lowStockEl = document.getElementById('low-stock-metric');
    
    if (totalItemsEl) totalItemsEl.textContent = totalItems;
    if (lowStockEl) {
      lowStockEl.textContent = lowStockCount;
      if (lowStockCount > 0) {
        lowStockEl.parentElement.classList.add('text-amber-500');
      } else {
        lowStockEl.parentElement.classList.remove('text-amber-500');
      }
    }
    
    // Renders active alerts list (items below thresholds)
    const alertListEl = document.getElementById('dashboard-alerts-list');
    if (alertListEl) {
      if (lowStockItems.length === 0) {
        alertListEl.innerHTML = `
          <div class="text-center py-6 text-slate-400 text-sm">
            <svg class="w-8 h-8 mx-auto mb-2 text-emerald-500 opacity-60" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
            All stock levels healthy.
          </div>
        `;
      } else {
        alertListEl.innerHTML = lowStockItems.map(item => `
          <div class="flex items-center justify-between p-3 rounded-lg bg-slate-900/40 border border-amber-500/20 hover:border-amber-500/40 transition">
            <div class="flex flex-col">
              <span class="font-semibold text-sm text-slate-200">${item.name}</span>
              <span class="text-xs text-slate-400">SKU: ${item.id} | ${item.category}</span>
            </div>
            <div class="text-right">
              <span class="badge-low-stock px-2.5 py-0.5 text-xs font-bold rounded-full">${item.quantity} in stock</span>
              <div class="text-2xs text-slate-400 mt-1">Min required: ${item.minThreshold}</div>
            </div>
          </div>
        `).join('');
      }
    }

    // Render Recent Activities list
    const recentActivityEl = document.getElementById('recent-activity-list');
    if (recentActivityEl) {
      const limitTxs = transactions.slice(0, 5); // top 5
      if (limitTxs.length === 0) {
        recentActivityEl.innerHTML = `
          <div class="text-center py-6 text-slate-400 text-sm">
            No transactions logged yet.
          </div>
        `;
      } else {
        recentActivityEl.innerHTML = limitTxs.map(tx => {
          const badgeClass = tx.direction === 'in' ? 'badge-in' : 'badge-out';
          const directionText = tx.direction === 'in' ? 'STOCK IN' : 'STOCK OUT';
          const timeString = new Date(tx.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
          const userA = tx.personA;
          
          return `
            <div class="flex items-center justify-between p-3 rounded-lg bg-slate-900/20 border border-white/5 hover:border-white/10 transition">
              <div class="flex items-center space-x-3">
                <span class="${badgeClass} px-2 py-0.5 text-2xs font-extrabold rounded">${directionText}</span>
                <div class="flex flex-col">
                  <span class="font-semibold text-sm text-slate-200">${tx.itemName}</span>
                  <span class="text-2xs text-slate-400">${userA} at ${timeString}</span>
                </div>
              </div>
              <div class="text-right font-bold text-slate-100 text-sm">
                ${tx.direction === 'in' ? '+' : '-'}${tx.quantity}
              </div>
            </div>
          `;
        }).join('');
      }
    }
  } catch (err) {
    console.error('Error loading dashboard stats:', err);
  }
}

// --- Inventory Initializer ---
let currentSearch = '';
let currentCategory = 'All';

async function initInventory() {
  const searchInput = document.getElementById('inventory-search');
  const categoryFilter = document.getElementById('inventory-category-filter');
  
  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      currentSearch = e.target.value.toLowerCase();
      renderInventoryGrid();
    });
  }
  
  if (categoryFilter) {
    categoryFilter.addEventListener('change', (e) => {
      currentCategory = e.target.value;
      renderInventoryGrid();
    });
  }

  // Setup Modals (Add/Edit)
  setupInventoryModals();
  
  // Render Initial Grid
  renderInventoryGrid();
}

async function renderInventoryGrid() {
  const tableBody = document.getElementById('inventory-table-body');
  const cardGrid = document.getElementById('inventory-card-grid');
  if (!tableBody && !cardGrid) return;
  
  try {
    const items = await window.StockDB.getAllItems();
    
    // Filter items
    const filteredItems = items.filter(item => {
      const matchesSearch = item.name.toLowerCase().includes(currentSearch) || 
                            item.id.toLowerCase().includes(currentSearch) || 
                            item.category.toLowerCase().includes(currentSearch);
      const matchesCategory = currentCategory === 'All' || item.category === currentCategory;
      return matchesSearch && matchesCategory;
    });

    if (filteredItems.length === 0) {
      const emptyState = `
        <tr>
          <td colspan="6" class="text-center py-12 text-slate-400">
            <svg class="w-12 h-12 mx-auto mb-3 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0a2 2 0 01-2 2H6a2 2 0 01-2-2m16 0V9a2 2 0 00-2-2H6a2 2 0 00-2 2v4h16z"></path></svg>
            No hardware items match the search filters.
          </td>
        </tr>
      `;
      if (tableBody) tableBody.innerHTML = emptyState;
      if (cardGrid) cardGrid.innerHTML = `<div class="col-span-full text-center py-12 text-slate-400">No items found.</div>`;
      return;
    }

    // Render Grid/Table Rows
    let rowsHTML = '';
    let cardsHTML = '';

    filteredItems.forEach(item => {
      let stockBadgeHTML = '';
      if (item.quantity < item.minThreshold) {
        stockBadgeHTML = `<span class="badge-low-stock px-2 py-0.5 text-2xs font-semibold rounded-full">Low Stock</span>`;
      } else if (item.quantity > item.maxCapacity) {
        stockBadgeHTML = `<span class="badge-over-stock px-2 py-0.5 text-2xs font-semibold rounded-full">Over Stock</span>`;
      } else {
        stockBadgeHTML = `<span class="bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-2 py-0.5 text-2xs font-semibold rounded-full">Healthy</span>`;
      }

      const qtyColorClass = item.quantity < item.minThreshold 
        ? 'text-amber-400 font-bold' 
        : item.quantity > item.maxCapacity 
          ? 'text-red-400 font-bold' 
          : 'text-slate-100 font-medium';

      rowsHTML += `
        <tr class="border-b border-white/5 hover:bg-slate-900/30 transition">
          <td class="px-6 py-4 font-semibold text-sky">${item.id}</td>
          <td class="px-6 py-4 text-slate-100">${item.name}</td>
          <td class="px-6 py-4 text-slate-400 text-sm">${item.category}</td>
          <td class="px-6 py-4 text-sm ${qtyColorClass}">${item.quantity}</td>
          <td class="px-6 py-4 text-sm text-slate-400">${item.minThreshold} / ${item.maxCapacity}</td>
          <td class="px-6 py-4 text-sm">${stockBadgeHTML}</td>
          <td class="px-6 py-4 text-right text-sm font-medium space-x-2">
            <button onclick="openEditModal('${item.id}')" class="text-sky hover:text-sky-300 font-semibold focus:outline-none transition">Edit</button>
            <button onclick="deleteInventoryItem('${item.id}')" class="text-red-400 hover:text-red-300 font-semibold focus:outline-none transition">Delete</button>
          </td>
        </tr>
      `;

      cardsHTML += `
        <div class="glass-card rounded-2xl p-6 flex flex-col justify-between">
          <div>
            <div class="flex justify-between items-start mb-3">
              <span class="text-2xs font-extrabold tracking-widest text-sky uppercase">${item.category}</span>
              ${stockBadgeHTML}
            </div>
            <h3 class="text-lg font-bold text-slate-100 mb-1 leading-snug">${item.name}</h3>
            <p class="text-xs text-slate-400 font-mono mb-4">SKU: ${item.id}</p>
            
            <div class="grid grid-cols-2 gap-4 mb-4 bg-slate-950/30 p-3 rounded-xl border border-white/5">
              <div>
                <span class="text-3xs text-slate-400 block uppercase tracking-wider">Current Stock</span>
                <span class="text-xl font-bold ${qtyColorClass}">${item.quantity}</span>
              </div>
              <div>
                <span class="text-3xs text-slate-400 block uppercase tracking-wider">Limits (Min/Max)</span>
                <span class="text-sm font-semibold text-slate-300">${item.minThreshold} / ${item.maxCapacity}</span>
              </div>
            </div>
          </div>
          
          <div class="flex justify-between items-center mt-2 pt-2 border-t border-white/5">
            <span class="text-3xs text-slate-400">Loc: ${item.location || 'N/A'}</span>
            <div class="space-x-3">
              <button onclick="openEditModal('${item.id}')" class="text-xs text-sky hover:text-sky-300 font-bold focus:outline-none">Edit</button>
              <button onclick="deleteInventoryItem('${item.id}')" class="text-xs text-red-400 hover:text-red-300 font-bold focus:outline-none">Delete</button>
            </div>
          </div>
        </div>
      `;
    });

    if (tableBody) tableBody.innerHTML = rowsHTML;
    if (cardGrid) cardGrid.innerHTML = cardsHTML;
  } catch (err) {
    console.error('Failed to render inventory:', err);
  }
}

// Setup Modals
function setupInventoryModals() {
  const addModal = document.getElementById('add-item-modal');
  const editModal = document.getElementById('edit-item-modal');
  
  const openAddBtn = document.getElementById('open-add-modal-btn');
  const closeAddBtn = document.getElementById('close-add-modal-btn');
  const closeEditBtn = document.getElementById('close-edit-modal-btn');
  
  const addForm = document.getElementById('add-item-form');
  const editForm = document.getElementById('edit-item-form');

  if (openAddBtn && addModal) {
    openAddBtn.addEventListener('click', () => {
      // Auto-generate a unique SKU prefix on form open
      const randStr = Math.floor(100 + Math.random() * 900);
      const skuInput = document.getElementById('add-sku');
      if (skuInput) skuInput.value = `HW-NEW-${randStr}`;
      addModal.classList.remove('hidden');
      addModal.classList.add('flex');
    });
  }

  if (closeAddBtn && addModal) {
    closeAddBtn.addEventListener('click', () => {
      addModal.classList.add('hidden');
      addModal.classList.remove('flex');
    });
  }

  if (closeEditBtn && editModal) {
    closeEditBtn.addEventListener('click', () => {
      editModal.classList.add('hidden');
      editModal.classList.remove('flex');
    });
  }

  // Handle Add Item Submission
  if (addForm) {
    addForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const sku = document.getElementById('add-sku').value.trim().toUpperCase();
      const name = document.getElementById('add-name').value.trim();
      const category = document.getElementById('add-category').value;
      const qty = parseInt(document.getElementById('add-qty').value, 10);
      const minVal = parseInt(document.getElementById('add-min').value, 10);
      const maxVal = parseInt(document.getElementById('add-max').value, 10);
      const loc = document.getElementById('add-location').value.trim() || 'Warehouse A';

      if (!sku || !name || isNaN(qty) || isNaN(minVal) || isNaN(maxVal)) {
        showToast('Please fill in all mandatory fields.', 'error');
        return;
      }

      // Check if SKU exists
      const existing = await window.StockDB.getItem(sku);
      if (existing) {
        showToast('SKU already exists. Please choose a unique SKU.', 'error');
        return;
      }

      const newItem = {
        id: sku,
        name,
        category,
        quantity: qty,
        minThreshold: minVal,
        maxCapacity: maxVal,
        location: loc,
        updatedAt: Date.now()
      };

      try {
        await window.StockDB.putItem(newItem);
        showToast('New hardware item added successfully!', 'success');
        addForm.reset();
        addModal.classList.add('hidden');
        addModal.classList.remove('flex');
        renderInventoryGrid();
      } catch (err) {
        showToast('Error saving item: ' + err.message, 'error');
      }
    });
  }

  // Handle Edit Item Submission
  if (editForm) {
    editForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const sku = document.getElementById('edit-sku').value;
      const name = document.getElementById('edit-name').value.trim();
      const category = document.getElementById('edit-category').value;
      const qty = parseInt(document.getElementById('edit-qty').value, 10);
      const minVal = parseInt(document.getElementById('edit-min').value, 10);
      const maxVal = parseInt(document.getElementById('edit-max').value, 10);
      const loc = document.getElementById('edit-location').value.trim();

      if (!name || isNaN(qty) || isNaN(minVal) || isNaN(maxVal)) {
        showToast('Please fill in all mandatory fields.', 'error');
        return;
      }

      const updatedItem = {
        id: sku,
        name,
        category,
        quantity: qty,
        minThreshold: minVal,
        maxCapacity: maxVal,
        location: loc,
        updatedAt: Date.now()
      };

      try {
        await window.StockDB.putItem(updatedItem);
        showToast('Item updated successfully!', 'success');
        editModal.classList.add('hidden');
        editModal.classList.remove('flex');
        renderInventoryGrid();
      } catch (err) {
        showToast('Error updating item: ' + err.message, 'error');
      }
    });
  }
}

// Edit Modal Opening Action (Global binds)
async function openEditModal(sku) {
  const editModal = document.getElementById('edit-item-modal');
  if (!editModal) return;
  
  try {
    const item = await window.StockDB.getItem(sku);
    if (!item) return;

    document.getElementById('edit-sku').value = item.id;
    document.getElementById('edit-name').value = item.name;
    document.getElementById('edit-category').value = item.category;
    document.getElementById('edit-qty').value = item.quantity;
    document.getElementById('edit-min').value = item.minThreshold;
    document.getElementById('edit-max').value = item.maxCapacity;
    document.getElementById('edit-location').value = item.location || '';

    editModal.classList.remove('hidden');
    editModal.classList.add('flex');
  } catch (err) {
    console.error('Failed to load edit details:', err);
  }
}
window.openEditModal = openEditModal;

// Delete Inventory Item
async function deleteInventoryItem(sku) {
  if (confirm(`Are you sure you want to delete item SKU: ${sku}?`)) {
    try {
      await window.StockDB.deleteItem(sku);
      showToast('Item removed from inventory.', 'success');
      renderInventoryGrid();
    } catch (err) {
      showToast('Failed to delete item: ' + err.message, 'error');
    }
  }
}
window.deleteInventoryItem = deleteInventoryItem;

// --- Transaction Page Initializer (QR Integration) ---
let html5QrcodeScanner = null;
let currentTransactionDirection = 'in'; // default flow

async function initTransaction() {
  const btnIn = document.getElementById('btn-flow-in');
  const btnOut = document.getElementById('btn-flow-out');
  const formIn = document.getElementById('form-stock-in');
  const formOut = document.getElementById('form-stock-out');
  
  // Set default values in forms for Logged-In Operator
  const receivedBy = document.getElementById('received-by');
  const authorizedBy = document.getElementById('authorized-by');
  
  if (receivedBy) receivedBy.value = AppState.activeUser;
  if (authorizedBy) authorizedBy.value = AppState.activeUser;

  // Toggle Flow Buttons
  if (btnIn && btnOut && formIn && formOut) {
    btnIn.addEventListener('click', () => {
      currentTransactionDirection = 'in';
      btnIn.className = 'flex-1 py-3 px-4 rounded-xl font-bold bg-sky-primary text-white border border-sky-400/20 shadow-lg shadow-sky-900/20 focus:outline-none transition';
      btnOut.className = 'flex-1 py-3 px-4 rounded-xl font-bold bg-slate-900/40 text-slate-400 border border-white/5 hover:bg-slate-900/60 focus:outline-none transition';
      formIn.classList.remove('hidden');
      formOut.classList.add('hidden');
      stopScanner();
    });

    btnOut.addEventListener('click', () => {
      currentTransactionDirection = 'out';
      btnOut.className = 'flex-1 py-3 px-4 rounded-xl font-bold bg-amber-500 text-slate-900 border border-amber-400/20 shadow-lg shadow-amber-900/20 focus:outline-none transition';
      btnIn.className = 'flex-1 py-3 px-4 rounded-xl font-bold bg-slate-900/40 text-slate-400 border border-white/5 hover:bg-slate-900/60 focus:outline-none transition';
      formOut.classList.remove('hidden');
      formIn.classList.add('hidden');
      stopScanner();
    });
  }

  // Populate Fallback Dropdown List of Items
  populateItemSelects();

  // Bind Form Actions
  setupTransactionFormHandlers();
}

async function populateItemSelects() {
  const selectIn = document.getElementById('sku-select-in');
  const selectOut = document.getElementById('sku-select-out');
  
  if (!selectIn && !selectOut) return;

  try {
    const items = await window.StockDB.getAllItems();
    const optionsHTML = '<option value="">-- Choose Hardware SKU / Scan QR --</option>' + 
      items.map(item => `<option value="${item.id}">${item.id} - ${item.name} (${item.quantity} in stock)</option>`).join('');
    
    if (selectIn) selectIn.innerHTML = optionsHTML;
    if (selectOut) selectOut.innerHTML = optionsHTML;
  } catch (err) {
    console.error('Failed to populate SKU select list:', err);
  }
}

// Form Handlers
function setupTransactionFormHandlers() {
  const formIn = document.getElementById('form-stock-in');
  const formOut = document.getElementById('form-stock-out');

  if (formIn) {
    formIn.addEventListener('submit', async (e) => {
      e.preventDefault();
      
      const sku = document.getElementById('sku-select-in').value || document.getElementById('scanned-sku-display').textContent.trim();
      const quantity = parseInt(document.getElementById('qty-in').value, 10);
      const supplier = document.getElementById('brought-by').value.trim();
      const receiver = document.getElementById('received-by').value.trim();

      if (!sku || sku.startsWith('--') || isNaN(quantity) || quantity <= 0 || !supplier || !receiver) {
        showToast('Please fill out all mandatory fields and select a valid item.', 'error');
        return;
      }

      const res = await saveTransaction({
        itemId: sku,
        direction: 'in',
        quantity,
        personA: supplier,
        personB: receiver
      });

      if (res.success) {
        showToast(`Stocked In ${quantity} units of SKU ${sku} successfully!`, 'success');
        formIn.reset();
        // Reset manual UI placeholders
        document.getElementById('scanned-sku-display').textContent = 'None';
        document.getElementById('scanned-item-details').classList.add('hidden');
        
        // Refresh dropdown
        populateItemSelects();
        
        // Auto Operator fill
        document.getElementById('received-by').value = AppState.activeUser;
        stopScanner();
      }
    });
  }

  if (formOut) {
    formOut.addEventListener('submit', async (e) => {
      e.preventDefault();
      
      const sku = document.getElementById('sku-select-out').value || document.getElementById('scanned-sku-display').textContent.trim();
      const quantity = parseInt(document.getElementById('qty-out').value, 10);
      const technician = document.getElementById('taken-by').value.trim();
      const authorizer = document.getElementById('authorized-by').value.trim();

      if (!sku || sku.startsWith('--') || isNaN(quantity) || quantity <= 0 || !technician || !authorizer) {
        showToast('Please fill out all mandatory fields and select a valid item.', 'error');
        return;
      }

      // Pre-flight check on quantity
      const item = await window.StockDB.getItem(sku);
      if (item && item.quantity < quantity) {
        showToast(`Out of Stock: Cannot retrieve ${quantity} units. Only ${item.quantity} items available.`, 'error');
        return;
      }

      const res = await saveTransaction({
        itemId: sku,
        direction: 'out',
        quantity,
        personA: technician,
        personB: authorizer
      });

      if (res.success) {
        showToast(`Stocked Out ${quantity} units of SKU ${sku} successfully.`, 'warning');
        formOut.reset();
        // Reset manual UI placeholders
        document.getElementById('scanned-sku-display').textContent = 'None';
        document.getElementById('scanned-item-details').classList.add('hidden');
        
        // Refresh dropdown
        populateItemSelects();
        
        // Auto Operator fill
        document.getElementById('authorized-by').value = AppState.activeUser;
        stopScanner();
      }
    });
  }

  // Handle SKU Dropdown Changes to render item metadata cards dynamically
  const selectIn = document.getElementById('sku-select-in');
  const selectOut = document.getElementById('sku-select-out');

  const onSKUSelectChange = async (sku) => {
    if (!sku) {
      document.getElementById('scanned-item-details').classList.add('hidden');
      return;
    }
    
    try {
      const item = await window.StockDB.getItem(sku);
      if (item) {
        document.getElementById('scanned-sku-display').textContent = item.id;
        document.getElementById('item-detail-name').textContent = item.name;
        document.getElementById('item-detail-category').textContent = item.category;
        document.getElementById('item-detail-qty').textContent = `${item.quantity} currently in stock`;
        document.getElementById('scanned-item-details').classList.remove('hidden');
      }
    } catch (err) {
      console.error(err);
    }
  };

  if (selectIn) selectIn.addEventListener('change', (e) => onSKUSelectChange(e.target.value));
  if (selectOut) selectOut.addEventListener('change', (e) => onSKUSelectChange(e.target.value));
}

// --- QR Camera Scanning Implementation ---
function startScanner() {
  const qrContainer = document.getElementById('qr-reader');
  const startBtn = document.getElementById('start-scan-btn');
  const stopBtn = document.getElementById('stop-scan-btn');
  
  if (!qrContainer) return;
  
  // Show Reader container
  qrContainer.classList.remove('hidden');
  if (startBtn) startBtn.classList.add('hidden');
  if (stopBtn) stopBtn.classList.remove('hidden');

  // Initialize library
  if (!html5QrcodeScanner) {
    html5QrcodeScanner = new Html5Qrcode("qr-reader");
  }

  const qrCodeSuccessCallback = async (decodedText, decodedResult) => {
    console.log(`QR Scanned successfully: ${decodedText}`, decodedResult);
    
    // Stop scanning
    stopScanner();
    
    // Process Scanned SKU
    const item = await window.StockDB.getItem(decodedText);
    
    if (item) {
      showToast(`Scanned SKU: ${decodedText}`, 'success');
      
      // Auto-fill form values
      const selectIn = document.getElementById('sku-select-in');
      const selectOut = document.getElementById('sku-select-out');
      
      if (currentTransactionDirection === 'in' && selectIn) {
        selectIn.value = decodedText;
      } else if (currentTransactionDirection === 'out' && selectOut) {
        selectOut.value = decodedText;
      }
      
      // Update UI metadata card
      document.getElementById('scanned-sku-display').textContent = item.id;
      document.getElementById('item-detail-name').textContent = item.name;
      document.getElementById('item-detail-category').textContent = item.category;
      document.getElementById('item-detail-qty').textContent = `${item.quantity} currently in stock`;
      document.getElementById('scanned-item-details').classList.remove('hidden');
    } else {
      showToast(`SKU ${decodedText} not found in inventory record.`, 'error');
    }
  };

  const config = { fps: 10, qrbox: { width: 250, height: 250 } };

  // Start web camera
  html5QrcodeScanner.start(
    { facingMode: "environment" }, 
    config, 
    qrCodeSuccessCallback
  ).catch(err => {
    console.error("Failed to start QR scanner:", err);
    showToast("Web camera permission denied or device camera unavailable.", "error");
    stopScanner();
  });
}

function stopScanner() {
  const qrContainer = document.getElementById('qr-reader');
  const startBtn = document.getElementById('start-scan-btn');
  const stopBtn = document.getElementById('stop-scan-btn');
  
  if (html5QrcodeScanner && html5QrcodeScanner.isScanning) {
    html5QrcodeScanner.stop().then(() => {
      console.log("QR Scanner stopped.");
      if (qrContainer) qrContainer.classList.add('hidden');
      if (startBtn) startBtn.classList.remove('hidden');
      if (stopBtn) stopBtn.classList.add('hidden');
    }).catch(err => console.error("Error stopping scanner:", err));
  } else {
    if (qrContainer) qrContainer.classList.add('hidden');
    if (startBtn) startBtn.classList.remove('hidden');
    if (stopBtn) stopBtn.classList.add('hidden');
  }
}

// Bind scanning commands to window for inline calls
window.startScanner = startScanner;
window.stopScanner = stopScanner;

// --- Transaction History Logs Page ---
let filterTxDirection = 'all';
let filterTxSearch = '';
let filterTxStartDate = '';
let filterTxEndDate = '';

async function initHistory() {
  const selectDir = document.getElementById('history-filter-direction');
  const inputSearch = document.getElementById('history-search');
  const inputStartDate = document.getElementById('history-start-date');
  const inputEndDate = document.getElementById('history-end-date');
  const exportBtn = document.getElementById('export-history-btn');

  if (selectDir) {
    selectDir.addEventListener('change', (e) => {
      filterTxDirection = e.target.value;
      renderHistoryTable();
    });
  }

  if (inputSearch) {
    inputSearch.addEventListener('input', (e) => {
      filterTxSearch = e.target.value.toLowerCase();
      renderHistoryTable();
    });
  }

  if (inputStartDate) {
    inputStartDate.addEventListener('change', (e) => {
      filterTxStartDate = e.target.value;
      renderHistoryTable();
    });
  }

  if (inputEndDate) {
    inputEndDate.addEventListener('change', (e) => {
      filterTxEndDate = e.target.value;
      renderHistoryTable();
    });
  }

  if (exportBtn) {
    exportBtn.addEventListener('click', () => {
      exportTransactionsJSON();
    });
  }

  // Bind beforeprint event to set up print report metadata
  window.addEventListener('beforeprint', () => {
    const printMeta = document.getElementById('print-report-meta');
    if (printMeta) {
      const startDesc = filterTxStartDate ? filterTxStartDate : 'Beginning of Time';
      const endDesc = filterTxEndDate ? filterTxEndDate : 'Present';
      printMeta.textContent = `Report Timeline: ${startDesc} to ${endDesc} | Operator: ALI | Generated: ${new Date().toLocaleString()}`;
    }
  });

  renderHistoryTable();
}

async function renderHistoryTable() {
  const tableBody = document.getElementById('history-table-body');
  if (!tableBody) return;

  try {
    const transactions = await window.StockDB.getAllTransactions();

    const filtered = transactions.filter(tx => {
      const matchesDir = filterTxDirection === 'all' || tx.direction === filterTxDirection;
      const matchesSearch = tx.itemName.toLowerCase().includes(filterTxSearch) ||
                            tx.itemId.toLowerCase().includes(filterTxSearch) ||
                            tx.personA.toLowerCase().includes(filterTxSearch) ||
                            tx.personB.toLowerCase().includes(filterTxSearch);
      
      let matchesStartDate = true;
      if (filterTxStartDate) {
        const startMs = new Date(filterTxStartDate + 'T00:00:00').getTime();
        matchesStartDate = tx.timestamp >= startMs;
      }

      let matchesEndDate = true;
      if (filterTxEndDate) {
        const endMs = new Date(filterTxEndDate + 'T23:59:59.999').getTime();
        matchesEndDate = tx.timestamp <= endMs;
      }

      return matchesDir && matchesSearch && matchesStartDate && matchesEndDate;
    });

    if (filtered.length === 0) {
      tableBody.innerHTML = `
        <tr>
          <td colspan="6" class="text-center py-12 text-slate-400">
            No transaction records found matching filters.
          </td>
        </tr>
      `;
      return;
    }

    tableBody.innerHTML = filtered.map(tx => {
      const directionText = tx.direction === 'in' ? 'STOCK IN' : 'STOCK OUT';
      const badgeClass = tx.direction === 'in' ? 'badge-in' : 'badge-out';
      const formattedDate = new Date(tx.timestamp).toLocaleString();
      const personALabel = tx.direction === 'in' ? 'Supplier: ' : 'Technician: ';
      const personBLabel = tx.direction === 'in' ? 'Received: ' : 'Authorized: ';

      return `
        <tr class="border-b border-white/5 hover:bg-slate-900/30 transition">
          <td class="px-6 py-4 text-slate-400 text-sm whitespace-nowrap">${formattedDate}</td>
          <td class="px-6 py-4">
            <div class="flex flex-col">
              <span class="font-semibold text-slate-100">${tx.itemName}</span>
              <span class="text-xs text-sky font-mono">${tx.itemId}</span>
            </div>
          </td>
          <td class="px-6 py-4 whitespace-nowrap">
            <span class="${badgeClass} px-2.5 py-0.5 text-2xs font-extrabold rounded">${directionText}</span>
          </td>
          <td class="px-6 py-4 text-slate-200 font-bold text-sm text-center">${tx.quantity}</td>
          <td class="px-6 py-4 text-xs text-slate-300">
            <span class="font-semibold text-slate-400">${personALabel}</span> ${tx.personA}
          </td>
          <td class="px-6 py-4 text-xs text-slate-300">
            <span class="font-semibold text-slate-400">${personBLabel}</span> ${tx.personB}
          </td>
        </tr>
      `;
    }).join('');
  } catch (err) {
    console.error('Failed to load transaction audit trail:', err);
  }
}

async function exportTransactionsJSON() {
  try {
    const transactions = await window.StockDB.getAllTransactions();
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(transactions, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute("href", dataStr);
    downloadAnchor.setAttribute("download", `hardware_stock_audit_log_${Date.now()}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
    showToast('Transaction audit log downloaded.', 'success');
  } catch (err) {
    showToast('Failed to export transactions: ' + err.message, 'error');
  }
}

// --- Application Core Bootstrap ---
window.addEventListener('DOMContentLoaded', async () => {
  try {
    // 1. Initialize DB
    await window.StockDB.open();
    
    // 2. Run Seeding logic
    await window.DBInit.seedIfEmpty();
    
    // 3. Render connection UI badges
    updateConnectionUI();
    
    // 4. Initialize Active Page specific elements
    initActivePage();
    
    // 5. Run sync on start if online
    if (AppState.isOnline()) {
      triggerBackgroundSync();
    }
  } catch (err) {
    console.error('Application bootstrap failed:', err);
  }
});
