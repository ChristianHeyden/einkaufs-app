(function () {
  "use strict";

  var STORAGE_KEY = "marktkorb.v1";
  var DEFAULT_STORES = ["Supermarkt", "Bio-Laden", "Bäckerei", "Metzgerei", "Drogerie", "Getränkemarkt", "Wochenmarkt"];

  var state = loadState();
  var items = state.items;
  var recipes = state.recipes;
  var activeTab = "liste";

  var contentEl = document.getElementById("content");
  var pageTitleEl = document.getElementById("pageTitle");
  var headerActionEl = document.getElementById("headerAction");
  var fabEl = document.getElementById("fab");
  var sheetEl = document.getElementById("sheet");
  var sheetBackdropEl = document.getElementById("sheetBackdrop");
  var sheetBodyEl = document.getElementById("sheetBody");
  var toastEl = document.getElementById("toast");
  var storeListEl = document.getElementById("storeList");
  var toastTimer = null;

  function loadState() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        var parsed = JSON.parse(raw);
        return { items: parsed.items || [], recipes: parsed.recipes || [] };
      }
    } catch (e) {}
    return { items: [], recipes: [] };
  }

  function saveState() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ items: items, recipes: recipes }));
    } catch (e) {}
  }

  function uid(prefix) {
    return prefix + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }

  function escapeHtml(str) {
    return String(str).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  function knownStores() {
    var set = {};
    DEFAULT_STORES.forEach(function (s) { set[s] = true; });
    items.forEach(function (i) { if (i.store) set[i.store] = true; });
    recipes.forEach(function (r) { r.ingredients.forEach(function (ig) { if (ig.store) set[ig.store] = true; }); });
    return Object.keys(set).sort(function (a, b) { return a.localeCompare(b, "de"); });
  }

  function refreshStoreDatalist() {
    storeListEl.innerHTML = knownStores().map(function (s) {
      return '<option value="' + escapeHtml(s) + '"></option>';
    }).join("");
  }

  function groupByStore(list) {
    var groups = {};
    list.forEach(function (it) {
      var key = it.store || "Sonstiges";
      if (!groups[key]) groups[key] = [];
      groups[key].push(it);
    });
    return Object.keys(groups).sort(function (a, b) { return a.localeCompare(b, "de"); }).map(function (k) {
      return { store: k, entries: groups[k] };
    });
  }

  function showToast(msg) {
    toastEl.textContent = msg;
    toastEl.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toastEl.classList.remove("show"); }, 2400);
  }

  var ICONS = {
    check: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="4 12.5 9.5 18 20 5"/></svg>',
    star: '<svg width="19" height="19" viewBox="0 0 24 24" fill="{fill}" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><path d="M12 3.5l2.65 5.53 6.1.85-4.4 4.28 1.03 6.07L12 17.2l-5.38 2.83 1.03-6.07-4.4-4.28 6.1-.85z"/></svg>',
    x: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><line x1="5" y1="5" x2="19" y2="19"/><line x1="19" y1="5" x2="5" y2="19"/></svg>',
    pencil: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20l1-4.2L15.6 5.2a1.5 1.5 0 0 1 2.1 0l1.1 1.1a1.5 1.5 0 0 1 0 2.1L8.2 19 4 20z"/></svg>',
    cart: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>'
  };

  function starIcon(active) {
    return ICONS.star.replace("{fill}", active ? "currentColor" : "none");
  }

  // ---------- render dispatch ----------

  function render() {
    document.querySelectorAll(".tab").forEach(function (t) {
      t.classList.toggle("active", t.dataset.tab === activeTab);
    });
    refreshStoreDatalist();

    if (activeTab === "liste") {
      pageTitleEl.textContent = "Liste";
      renderListe();
    } else if (activeTab === "favoriten") {
      pageTitleEl.textContent = "Favoriten";
      renderFavoriten();
    } else {
      pageTitleEl.textContent = "Rezepte";
      renderRezepte();
    }
  }

  function renderListe() {
    var inList = items.filter(function (i) { return i.inList; });
    var hasChecked = inList.some(function (i) { return i.checked; });

    headerActionEl.hidden = !hasChecked;
    headerActionEl.textContent = "Erledigte leeren";
    headerActionEl.onclick = clearChecked;

    if (inList.length === 0) {
      contentEl.innerHTML = emptyState("cart", "Deine Liste ist leer", "Füge Artikel über das Plus hinzu oder hol dir Zutaten aus einem Rezept.");
      return;
    }

    var groups = groupByStore(inList);
    var html = groups.map(function (g) {
      var sorted = g.entries.slice().sort(function (a, b) {
        if (!!a.checked !== !!b.checked) return a.checked ? 1 : -1;
        return a.name.localeCompare(b.name, "de");
      });
      var openCount = g.entries.filter(function (e) { return !e.checked; }).length;
      var rows = sorted.map(function (it) {
        return (
          '<div class="item-row' + (it.checked ? " checked" : "") + '" data-id="' + it.id + '">' +
            '<button class="check-circle" data-action="toggle-checked">' + ICONS.check + '</button>' +
            '<span class="item-name">' + escapeHtml(it.name) + '</span>' +
            '<button class="icon-btn star' + (it.favorite ? " active" : "") + '" data-action="toggle-favorite" aria-label="Favorit">' + starIcon(it.favorite) + '</button>' +
            '<button class="icon-btn remove" data-action="remove-item" aria-label="Entfernen">' + ICONS.x + '</button>' +
          '</div>'
        );
      }).join("");
      return (
        '<div class="store-group">' +
          '<div class="store-header"><span class="store-name">' + escapeHtml(g.store) + '</span><span class="store-count">' + openCount + '/' + g.entries.length + '</span></div>' +
          '<div class="card-list">' + rows + '</div>' +
        '</div>'
      );
    }).join("");

    contentEl.innerHTML = html;
  }

  function renderFavoriten() {
    var favs = items.filter(function (i) { return i.favorite; });

    headerActionEl.hidden = true;

    if (favs.length === 0) {
      contentEl.innerHTML = emptyState("star", "Noch keine Favoriten", "Markiere Artikel in deiner Liste mit dem Stern oder füge hier direkt einen hinzu.");
      return;
    }

    var groups = groupByStore(favs);
    var html = groups.map(function (g) {
      var sorted = g.entries.slice().sort(function (a, b) { return a.name.localeCompare(b.name, "de"); });
      var rows = sorted.map(function (it) {
        var actionHtml = it.inList
          ? '<span class="in-list-badge">' + ICONS.check + ' Auf der Liste</span>'
          : '<button class="add-chip" data-action="add-to-list">' + ICONS.cart + ' Zur Liste</button>';
        return (
          '<div class="fav-row" data-id="' + it.id + '">' +
            '<span class="item-name">' + escapeHtml(it.name) + '</span>' +
            actionHtml +
            '<button class="icon-btn star active" data-action="remove-favorite" aria-label="Favorit entfernen">' + starIcon(true) + '</button>' +
          '</div>'
        );
      }).join("");
      return (
        '<div class="store-group">' +
          '<div class="store-header"><span class="store-name">' + escapeHtml(g.store) + '</span><span class="store-count">' + g.entries.length + '</span></div>' +
          '<div class="card-list">' + rows + '</div>' +
        '</div>'
      );
    }).join("");

    contentEl.innerHTML = html;
  }

  function renderRezepte() {
    headerActionEl.hidden = true;

    if (recipes.length === 0) {
      contentEl.innerHTML = emptyState("book", "Noch keine Rezepte", "Leg ein Rezept an und füge mit einem Tipp alle Zutaten auf einmal zur Liste hinzu.");
      return;
    }

    var sorted = recipes.slice().sort(function (a, b) { return a.name.localeCompare(b.name, "de"); });
    contentEl.innerHTML = sorted.map(function (r) {
      return (
        '<div class="recipe-card" data-id="' + r.id + '" data-action="add-recipe">' +
          '<div class="folder-icon">' + bookIcon() + '</div>' +
          '<div class="recipe-info">' +
            '<h3>' + escapeHtml(r.name) + '</h3>' +
            '<div class="recipe-sub">' + r.ingredients.length + ' Zutat' + (r.ingredients.length === 1 ? "" : "en") + '</div>' +
          '</div>' +
          '<button class="icon-btn edit-btn" data-action="edit-recipe" aria-label="Bearbeiten">' + ICONS.pencil + '</button>' +
        '</div>'
      );
    }).join("");
  }

  function bookIcon() {
    return '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 5.2C4 4 5 3.4 6.3 3.6L11 4.4v15.3l-4.7-.8C5 18.7 4 18 4 16.8z"/><path d="M20 5.2C20 4 19 3.4 17.7 3.6L13 4.4v15.3l4.7-.8c1.3-.2 2.3-.9 2.3-2.1z"/></svg>';
  }

  function emptyIcon(kind) {
    if (kind === "star") return '<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><path d="M12 3.5l2.65 5.53 6.1.85-4.4 4.28 1.03 6.07L12 17.2l-5.38 2.83 1.03-6.07-4.4-4.28 6.1-.85z"/></svg>';
    if (kind === "book") return bookIcon();
    return '<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="20" r="1.2" fill="currentColor" stroke="none"/><circle cx="18" cy="20" r="1.2" fill="currentColor" stroke="none"/><path d="M2.5 3h2.4L7.6 15.2a2 2 0 0 0 2 1.6h7.9a2 2 0 0 0 1.96-1.62L21 7H6.2"/></svg>';
  }

  function emptyState(icon, title, text) {
    return (
      '<div class="empty-state">' +
        '<div class="icon-wrap">' + emptyIcon(icon) + '</div>' +
        '<h2>' + escapeHtml(title) + '</h2>' +
        '<p>' + escapeHtml(text) + '</p>' +
      '</div>'
    );
  }

  // ---------- mutations ----------

  function findItem(id) { return items.filter(function (i) { return i.id === id; })[0]; }

  function toggleChecked(id) {
    var it = findItem(id);
    if (!it) return;
    it.checked = !it.checked;
    saveState();
    render();
  }

  function toggleFavorite(id) {
    var it = findItem(id);
    if (!it) return;
    it.favorite = !it.favorite;
    saveState();
    render();
  }

  function removeItem(id) {
    var it = findItem(id);
    if (!it) return;
    if (it.favorite) {
      it.inList = false;
      it.checked = false;
    } else {
      items = items.filter(function (i) { return i.id !== id; });
    }
    saveState();
    render();
  }

  function clearChecked() {
    var removed = 0;
    items.forEach(function (it) { if (it.inList && it.checked) removed++; });
    items = items.filter(function (it) {
      if (!(it.inList && it.checked)) return true;
      if (it.favorite) { it.inList = false; it.checked = false; return true; }
      return false;
    });
    saveState();
    render();
    if (removed) showToast("Erledigte Artikel entfernt");
  }

  function addToListFromFav(id) {
    var it = findItem(id);
    if (!it) return;
    it.inList = true;
    it.checked = false;
    saveState();
    render();
    showToast('„' + it.name + '" zur Liste hinzugefügt');
  }

  function removeFavorite(id) {
    var it = findItem(id);
    if (!it) return;
    it.favorite = false;
    if (!it.inList) items = items.filter(function (i) { return i.id !== id; });
    saveState();
    render();
  }

  function addRecipeToList(recipeId) {
    var recipe = recipes.filter(function (r) { return r.id === recipeId; })[0];
    if (!recipe) return;
    recipe.ingredients.forEach(function (ing) {
      var existing = items.filter(function (i) {
        return i.name.trim().toLowerCase() === ing.name.trim().toLowerCase() && i.store === ing.store;
      })[0];
      if (existing) {
        existing.inList = true;
        existing.checked = false;
      } else {
        items.push({ id: uid("i"), name: ing.name, store: ing.store, favorite: false, inList: true, checked: false, createdAt: Date.now() });
      }
    });
    saveState();
    activeTab = "liste";
    render();
    showToast(recipe.ingredients.length + ' Zutaten aus „' + recipe.name + '" hinzugefügt');
  }

  // ---------- sheets ----------

  function openSheet(html) {
    sheetBodyEl.innerHTML = html;
    sheetEl.classList.add("open");
    sheetBackdropEl.classList.add("open");
    document.body.classList.add("sheet-open");
  }

  function closeSheet() {
    sheetEl.classList.remove("open");
    sheetBackdropEl.classList.remove("open");
    document.body.classList.remove("sheet-open");
  }

  function openAddItemSheet(mode) {
    var isFav = mode === "favoriten";
    var toggleLabel = isFav ? "Auch zur Liste hinzufügen" : "Auch zu Favoriten hinzufügen";
    var html =
      '<h2>' + (isFav ? "Neuer Favorit" : "Artikel hinzufügen") + '</h2>' +
      '<div class="field"><label>Name</label><input type="text" id="fName" placeholder="z. B. Milch" autocomplete="off"></div>' +
      '<div class="field"><label>Laden</label><input type="text" id="fStore" list="storeList" placeholder="z. B. Supermarkt" autocomplete="off"></div>' +
      '<div class="toggle-row"><span>' + toggleLabel + '</span><button class="switch" id="fToggle"></button></div>' +
      '<div class="sheet-actions">' +
        '<button class="btn btn-ghost" id="fCancel">Abbrechen</button>' +
        '<button class="btn btn-primary" id="fSave">Speichern</button>' +
      '</div>';
    openSheet(html);

    var toggleOn = false;
    var toggleEl = document.getElementById("fToggle");
    toggleEl.onclick = function () {
      toggleOn = !toggleOn;
      toggleEl.classList.toggle("on", toggleOn);
    };
    document.getElementById("fCancel").onclick = closeSheet;
    document.getElementById("fName").focus();

    document.getElementById("fSave").onclick = function () {
      var name = document.getElementById("fName").value.trim();
      var store = document.getElementById("fStore").value.trim() || "Sonstiges";
      if (!name) { document.getElementById("fName").focus(); return; }
      items.push({
        id: uid("i"),
        name: name,
        store: store,
        favorite: isFav ? true : toggleOn,
        inList: isFav ? toggleOn : true,
        checked: false,
        createdAt: Date.now()
      });
      saveState();
      closeSheet();
      render();
      showToast("Hinzugefügt");
    };
  }

  function ingredientRowHtml(name, store) {
    return (
      '<div class="ingredient-row">' +
        '<input type="text" class="row-name" placeholder="Zutat" value="' + escapeHtml(name || "") + '" autocomplete="off">' +
        '<input type="text" class="row-store" list="storeList" placeholder="Laden" value="' + escapeHtml(store || "") + '" autocomplete="off">' +
        '<button type="button" data-action="remove-row">' + ICONS.x + '</button>' +
      '</div>'
    );
  }

  function openRecipeSheet(recipeId) {
    var recipe = recipeId ? recipes.filter(function (r) { return r.id === recipeId; })[0] : null;
    var rowsHtml = (recipe ? recipe.ingredients : [{ name: "", store: "" }]).map(function (ing) {
      return ingredientRowHtml(ing.name, ing.store);
    }).join("");

    var html =
      '<h2>' + (recipe ? "Rezept bearbeiten" : "Neues Rezept") + '</h2>' +
      '<div class="field"><label>Rezeptname</label><input type="text" id="rName" placeholder="z. B. Spaghetti Bolognese" value="' + escapeHtml(recipe ? recipe.name : "") + '" autocomplete="off"></div>' +
      '<label style="display:block;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:var(--ink-muted);margin-bottom:8px;">Zutaten</label>' +
      '<div id="ingredientRows">' + rowsHtml + '</div>' +
      '<button type="button" class="add-row-btn" id="addRow">' + ICONS.cart.replace('width="15" height="15"', 'width="14" height="14"') + ' Zutat hinzufügen</button>' +
      '<div class="sheet-actions">' +
        '<button class="btn btn-ghost" id="rCancel">Abbrechen</button>' +
        '<button class="btn btn-primary" id="rSave">Speichern</button>' +
      '</div>' +
      (recipe ? '<button type="button" class="btn-danger-text" id="rDelete">Rezept löschen</button>' : '');

    openSheet(html);

    var rowsContainer = document.getElementById("ingredientRows");

    rowsContainer.addEventListener("click", function (e) {
      var btn = e.target.closest('[data-action="remove-row"]');
      if (!btn) return;
      var row = btn.closest(".ingredient-row");
      if (rowsContainer.children.length > 1) row.remove();
      else {
        row.querySelector(".row-name").value = "";
        row.querySelector(".row-store").value = "";
      }
    });

    document.getElementById("addRow").onclick = function () {
      rowsContainer.insertAdjacentHTML("beforeend", ingredientRowHtml("", ""));
    };

    document.getElementById("rCancel").onclick = closeSheet;

    if (recipe) {
      document.getElementById("rDelete").onclick = function () {
        recipes = recipes.filter(function (r) { return r.id !== recipe.id; });
        saveState();
        closeSheet();
        render();
        showToast("Rezept gelöscht");
      };
    }

    document.getElementById("rSave").onclick = function () {
      var name = document.getElementById("rName").value.trim();
      var ingredients = [];
      rowsContainer.querySelectorAll(".ingredient-row").forEach(function (row) {
        var n = row.querySelector(".row-name").value.trim();
        var s = row.querySelector(".row-store").value.trim() || "Sonstiges";
        if (n) ingredients.push({ name: n, store: s });
      });
      if (!name) { document.getElementById("rName").focus(); return; }
      if (ingredients.length === 0) { rowsContainer.querySelector(".row-name").focus(); return; }

      if (recipe) {
        recipe.name = name;
        recipe.ingredients = ingredients;
      } else {
        recipes.push({ id: uid("r"), name: name, ingredients: ingredients, createdAt: Date.now() });
      }
      saveState();
      closeSheet();
      render();
      showToast("Rezept gespeichert");
    };
  }

  // ---------- events ----------

  document.querySelectorAll(".tab").forEach(function (tab) {
    tab.addEventListener("click", function () {
      activeTab = tab.dataset.tab;
      render();
    });
  });

  fabEl.addEventListener("click", function () {
    if (activeTab === "rezepte") openRecipeSheet(null);
    else openAddItemSheet(activeTab);
  });

  sheetBackdropEl.addEventListener("click", closeSheet);

  contentEl.addEventListener("click", function (e) {
    var actionEl = e.target.closest("[data-action]");
    if (!actionEl) return;
    var action = actionEl.dataset.action;

    if (action === "edit-recipe") {
      e.stopPropagation();
      var card = actionEl.closest(".recipe-card");
      openRecipeSheet(card.dataset.id);
      return;
    }
    if (action === "add-recipe") {
      addRecipeToList(actionEl.dataset.id);
      return;
    }

    var row = actionEl.closest("[data-id]");
    if (!row) return;
    var id = row.dataset.id;

    if (action === "toggle-checked") toggleChecked(id);
    else if (action === "toggle-favorite") toggleFavorite(id);
    else if (action === "remove-item") removeItem(id);
    else if (action === "add-to-list") addToListFromFav(id);
    else if (action === "remove-favorite") removeFavorite(id);
  });

  render();
})();
