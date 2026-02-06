// Atlas Craft App Logic

// Initial Game Versions (Fallbacks)
const FALLBACK_VERSIONS = [
    "1.21.4", "1.21.1", "1.21", "1.20.4", "1.20.1", "1.19.4", "1.19.2", "1.18.2", "1.16.5", "1.12.2", "1.8.9", "1.7.10"
];

let profiles = [];
// Dropdown Data
let allGameVersions = [];
let allLoaderVersions = [];

// Init
function init() {
    console.log("Atlas Craft Initialized");
    loadProfiles();

    // Close dropdowns when clicking outside
    document.addEventListener('click', function (e) {
        if (!e.target.closest('.custom-select-wrapper')) {
            document.querySelectorAll('.custom-options-list').forEach(el => el.classList.remove('show'));
        }
    });

    if (window.bridge) {
        window.bridge.fetchGameVersions();
    } else {
        setTimeout(() => {
            if (window.bridge) window.bridge.fetchGameVersions();
        }, 1000);
        receiveGameVersions(FALLBACK_VERSIONS);
    }
}

function loadProfiles() {
    if (!window.bridge) return;
    try {
        const json = window.bridge.getProfiles();
        let data = json;
        if (typeof json === 'string') {
            try { data = JSON.parse(json); } catch (e) { }
        }
        profiles = data || [];
        renderProfiles();
    } catch (e) {
        console.error("Error loading profiles", e);
    }
}

function renderProfiles() {
    const grid = document.getElementById("profileGrid");
    grid.innerHTML = "";

    if (!profiles) profiles = [];

    profiles.forEach(p => {
        const card = document.createElement("div");
        card.className = "profile-card";

        // Icon
        let iconChar = "📦";
        if (p.modLoader === "fabric") iconChar = "🧵";
        else if (p.modLoader === "forge") iconChar = "🔥";

        // Actions Container
        const actions = document.createElement("div");
        actions.className = "card-actions";

        // Settings Button
        const btnSettings = document.createElement("button");
        btnSettings.className = "icon-btn";
        btnSettings.innerText = "⚙";
        btnSettings.onclick = function () { openSettings(p.name); };

        // Delete Button
        const btnDelete = document.createElement("button");
        btnDelete.className = "icon-btn delete-btn";
        btnDelete.innerText = "🗑";
        btnDelete.onclick = function () { deleteProfile(p.name); };

        actions.appendChild(btnSettings);
        actions.appendChild(btnDelete);

        // Card Content
        const iconDiv = document.createElement("div");
        iconDiv.className = "card-icon";
        iconDiv.innerText = iconChar;

        const titleDiv = document.createElement("div");
        titleDiv.className = "card-title";
        titleDiv.innerText = p.name;

        const subDiv = document.createElement("div");
        subDiv.className = "card-subtitle";
        subDiv.innerText = p.version + " • " + p.modLoader;

        // Launch Button
        const btnLaunch = document.createElement("button");
        btnLaunch.className = "launch-btn";
        btnLaunch.innerText = "LAUNCH";
        btnLaunch.onclick = function () {
            console.log("Launch Clicked via Listener: " + p.name);
            launch(p.name);
        };

        card.appendChild(actions);
        card.appendChild(iconDiv);
        card.appendChild(titleDiv);
        card.appendChild(subDiv);
        card.appendChild(btnLaunch);

        grid.appendChild(card);
    });
}
// ...
function launch(name) {
    console.log("Launch requested for: " + name);
    if (window.bridge) {
        window.bridge.launchProfile(name);
    } else {
        console.error("Bridge missing during launch");
        alert("Error: Internal Bridge Disconnected");
    }
}

// --- Custom Dropdown Logic ---

function toggleDropdown(type) {
    // type: 'version', 'loaderType', 'loaderVer'
    const listId = type + "OptionsList";
    const list = document.getElementById(listId);

    // Close others
    document.querySelectorAll('.custom-options-list').forEach(el => {
        if (el.id !== listId) el.classList.remove('show');
    });

    list.classList.toggle("show");

    // If opening SEARCHABLE dropdown, focus input
    if (list.classList.contains("show")) {
        if (type === 'version') document.getElementById('pVersionInput').focus();
        if (type === 'loaderVer') document.getElementById('pLoaderVerInput').focus();
    }
}

function filterDropdown(type) {
    const inputId = (type === 'version') ? 'pVersionInput' : 'pLoaderVerInput';
    const listId = type + "OptionsList";
    const dataList = (type === 'version') ? allGameVersions : allLoaderVersions;

    const input = document.getElementById(inputId);
    const filter = input.value.toLowerCase();
    const container = document.getElementById(listId);

    container.innerHTML = "";

    const filtered = dataList.filter(v => v.toLowerCase().includes(filter));

    if (filtered.length === 0) {
        container.innerHTML = "<div class='custom-option' style='cursor:default; color:#888'>No matches</div>";
    } else {
        filtered.forEach(v => {
            const div = document.createElement("div");
            div.className = "custom-option";
            div.innerText = v;
            div.onclick = () => selectOption(type, v);
            container.appendChild(div);
        });
    }

    if (!container.classList.contains("show")) container.classList.add("show");
}

function selectOption(type, value) {
    if (type === 'version') {
        document.getElementById('pVersionInput').value = value;
        document.getElementById('pVersion').value = value;
        onVersionChange();
    } else if (type === 'loaderVer') {
        document.getElementById('pLoaderVerInput').value = value;
        document.getElementById('pLoaderVer').value = value;
    }

    document.getElementById(type + "OptionsList").classList.remove("show");
}

// Special handler for Loader Type (Vanilla/Fabric/Forge) which is Readonly/No-Search
function selectLoaderType(value) {
    document.getElementById('pLoaderInput').value = value;
    document.getElementById('pLoader').value = value;
    document.getElementById('loaderTypeOptionsList').classList.remove("show");
    onLoaderChange();
}

// --- Populations ---

function receiveGameVersions(arg) {
    let versions = arg;
    if (typeof arg === 'string') {
        try { versions = JSON.parse(arg); } catch (e) { }
    }
    if (!versions || !Array.isArray(versions)) return;

    allGameVersions = versions;
    populateDropdownList('version', allGameVersions);
}

function populateDropdownList(type, list) {
    const container = document.getElementById(type + "OptionsList");
    container.innerHTML = "";
    list.forEach(v => {
        const div = document.createElement("div");
        div.className = "custom-option";
        div.innerText = v;
        div.onclick = () => selectOption(type, v);
        container.appendChild(div);
    });
}

function onLoaderChange() {
    const loader = document.getElementById('pLoader').value;
    const group = document.getElementById('loaderVerGroup');

    if (loader === "Vanilla") {
        group.style.display = "none";
    } else {
        group.style.display = "block";
        fetchLoaderVersions();
    }
}

function onVersionChange() {
    if (document.getElementById('pLoader').value !== "Vanilla") {
        fetchLoaderVersions();
    }
}

function fetchLoaderVersions() {
    const loader = document.getElementById('pLoader').value;
    const mcVer = document.getElementById('pVersion').value;

    if (!mcVer) return; // Wait for version

    const input = document.getElementById('pLoaderVerInput');
    input.value = "Loading...";
    input.disabled = true;

    if (loader === "Fabric") {
        if (window.bridge) window.bridge.fetchFabricVersions(mcVer);
    } else if (loader === "Forge") {
        if (window.bridge) window.bridge.fetchForgeVersions(mcVer);
    }
}

function receiveFabricVersions(arg) { handleLoaderReceive(arg); }
function receiveForgeVersions(arg) { handleLoaderReceive(arg); }

function handleLoaderReceive(arg) {
    let versions = arg;
    if (typeof arg === 'string') {
        try { versions = JSON.parse(arg); } catch (e) { }
    }

    const input = document.getElementById('pLoaderVerInput');
    input.disabled = false;
    input.value = "";
    input.placeholder = "Select Version...";

    if (!versions || !Array.isArray(versions) || versions.length === 0) {
        input.value = "No versions found";
        allLoaderVersions = [];
        populateDropdownList('loaderVer', []);
        return;
    }

    allLoaderVersions = versions;
    populateDropdownList('loaderVer', allLoaderVersions);
    // Auto select first?
    selectOption('loaderVer', versions[0]);
}


// --- Creation ---

function openAddModal() {
    document.getElementById("addModal").classList.add("open");
    document.getElementById("pName").value = "";

    // Default Version
    if (allGameVersions.length > 0 && !document.getElementById('pVersion').value) {
        selectOption('version', allGameVersions[0]);
    }
}

function closeModals() {
    document.querySelectorAll(".modal-overlay").forEach(el => el.classList.remove("open"));
}

function createProfile() {
    const name = document.getElementById("pName").value;
    const loader = document.getElementById("pLoader").value;
    const version = document.getElementById("pVersion").value;
    let loaderVer = null;

    if (!name) { alert("Please enter a name"); return; }
    if (!version) { alert("Please select a game version"); return; }

    if (loader !== "Vanilla") {
        loaderVer = document.getElementById('pLoaderVer').value;
        if (!loaderVer || loaderVer.startsWith("Loading") || loaderVer === "No versions found") {
            alert("Invalid Loader Version"); return;
        }
    }

    const profile = {
        name: name,
        version: version,
        modLoader: loader.toLowerCase(),
        loaderVersion: loaderVer,
        ramMb: 2048,
        javaPath: "java",
        gameDir: "instances/" + name,
        icon: "Box"
    };

    window.bridge.createProfile(JSON.stringify(profile));
    closeModals();
    setTimeout(loadProfiles, 500);
}

function deleteProfile(name) {
    if (confirm("Delete " + name + "?")) {
        window.bridge.deleteProfile(name);
        setTimeout(loadProfiles, 500);
    }
}

// --- Settings ---
let currentSettingsProfile = null;
function openSettings(name) {
    currentSettingsProfile = profiles.find(p => p.name === name);
    if (!currentSettingsProfile) return;
    document.getElementById("sProfileName").value = name;
    document.getElementById("sRam").value = currentSettingsProfile.ramMb || 2048;
    updateRamDisplay();
    document.getElementById("settingsModal").classList.add("open");
}
function updateRamDisplay() {
    document.getElementById("ramVal").innerText = document.getElementById("sRam").value;
}
function saveSettings() {
    if (!currentSettingsProfile) return;
    const ram = document.getElementById("sRam").value;
    window.bridge.saveProfileSettings(currentSettingsProfile.name, parseInt(ram));
    loadProfiles();
    closeModals();
}
function openMods() {
    if (currentSettingsProfile) window.bridge.openModsFolder(currentSettingsProfile.name);
}

function launch(name) {
    window.bridge.launchProfile(name);
}

// Global actions
function winMin() { if (window.bridge) window.bridge.windowMin(); }
function winMax() { if (window.bridge) window.bridge.windowMax(); }
function winClose() { if (window.bridge) window.bridge.windowClose(); }
