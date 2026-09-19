/* =========================================
   SUPABASE CONNECTION
   ========================================= */

const SUPABASE_URL =
    "https://qkemxeppymcbgcmhioyo.supabase.co";

const SUPABASE_KEY =
    "sb_publishable_94oNcBwBsb0Dsny-uP1JzQ_deVm-_1Q";

const supabaseClient =
    window.supabase.createClient(
        SUPABASE_URL,
        SUPABASE_KEY
    );

/* =========================================
   COLLECTION IMPORT
   ========================================= */

const importButton =
    document.getElementById("importButton");

const collectionFile =
    document.getElementById("collectionFile");

const collectionResults =
    document.getElementById("collectionResults");

const totalCards =
    document.getElementById("totalCards");

const collectionSearch =
    document.getElementById("collectionSearch");

const searchStatus =
    document.getElementById("searchStatus");

/* Collection loaded from Supabase */

let collection = [];


/* Read One CSV Row */

function parseCSVLine(line)
{
    const values = [];

    let currentValue = "";
    let insideQuotes = false;

    for (let i = 0; i < line.length; i++)
    {
        const character = line[i];

        if (character === '"')
        {
            if (insideQuotes && line[i + 1] === '"')
            {
                currentValue += '"';
                i++;
            }
            else
            {
                insideQuotes = !insideQuotes;
            }
        }
        else if (character === "," && !insideQuotes)
        {
            values.push(currentValue.trim());

            currentValue = "";
        }
        else
        {
            currentValue += character;
        }
    }

    values.push(currentValue.trim());

    return values;
}


/* Convert CSV Text Into Card Objects */

function parseCollectionCSV(csvText)
{
    const lines = csvText
        .replace(/^\uFEFF/, "")
        .split(/\r?\n/)
        .filter(line => line.trim() !== "");

    if (lines.length < 2)
    {
        throw new Error(
            "The CSV file must contain a header and cards."
        );
    }

    const headers = parseCSVLine(lines[0])
        .map(header => header.toLowerCase());

    const nameIndex =
        headers.indexOf("name");

    const quantityIndex =
        headers.indexOf("quantity");

    if (nameIndex === -1 || quantityIndex === -1)
    {
        throw new Error(
            "CSV must contain name and quantity columns."
        );
    }

    const importedCards = [];

    for (let i = 1; i < lines.length; i++)
    {
        const values = parseCSVLine(lines[i]);

        const name = values[nameIndex];

        const quantity =
            Number(values[quantityIndex]);

        if (!name ||
            !Number.isInteger(quantity) ||
            quantity <= 0)
        {
            throw new Error(
                "Invalid card on CSV line " + (i + 1)
            );
        }

        importedCards.push({
            name: name,
            quantity: quantity
        });
    }

    return importedCards;
}


/* Display Collection on Homepage */

function displayCollection()
{
    collectionResults.innerHTML = "";

    let total = 0;

    for (const card of collection)
    {
        total += card.quantity;
    }

    totalCards.textContent = total;

/* =========================================
   SEARCH COLLECTION
   ========================================= */

    const searchText =
        collectionSearch.value.trim().toLowerCase();

    const visibleCards =
        collection.filter(function(card)
        {
            return card.name.toLowerCase()
                .includes(searchText);
        });

    searchStatus.textContent =
        "Showing " + visibleCards.length +
        " of " + collection.length + " cards";

    if (collection.length === 0)
    {
        collectionResults.textContent =
            "No cards imported yet.";

        return;
    }

    /* No Cards Match Search */

    if (visibleCards.length === 0)
    {
        collectionResults.textContent =
            "No matching cards found.";

        return;
    }

    const table =
        document.createElement("table");

    table.className = "collection-table";

    const headerRow =
        document.createElement("tr");

    for (const heading of [
    "Card Name",
    "Quantity",
    "Actions"
    ])
    {
        const th =
            document.createElement("th");

        th.textContent = heading;

        headerRow.appendChild(th);
    }

    table.appendChild(headerRow);

    for (const card of visibleCards)
    {
        const row =
            document.createElement("tr");

        /* Card name */

        const nameCell =
            document.createElement("td");

        nameCell.textContent = card.name;

        /* Quantity controls */

        const quantityCell =
            document.createElement("td");

        const quantityControls =
            document.createElement("div");

        quantityControls.className =
            "quantity-controls";

        const minusButton =
            document.createElement("button");

        minusButton.textContent = "−";

        minusButton.className =
            "quantity-button";

        minusButton.type = "button";

        minusButton.setAttribute(
            "aria-label",
            "Remove one " + card.name
        );

        const quantityText =
            document.createElement("input");

        quantityText.type = "number";

        quantityText.min = "1";

        quantityText.step = "1";

        quantityText.value =
            card.quantity;

        quantityText.className =
            "quantity-number";

        quantityText.setAttribute(
            "aria-label",
            "Quantity of " + card.name
        );

        const plusButton =
            document.createElement("button");

        plusButton.textContent = "+";

        plusButton.className =
            "quantity-button";

        plusButton.type = "button";

        plusButton.setAttribute(
            "aria-label",
            "Add one " + card.name
        );

        minusButton.disabled =
            card.quantity <= 1;

        quantityControls.appendChild(
            minusButton
        );

        quantityControls.appendChild(
            quantityText
        );

        quantityControls.appendChild(
            plusButton
        );

        quantityCell.appendChild(
            quantityControls
        );

        /* Delete button */

        const actionCell =
            document.createElement("td");

        const deleteButton =
            document.createElement("button");

        deleteButton.textContent = "×";

        deleteButton.className =
            "delete-card-button";

        deleteButton.type = "button";

        deleteButton.setAttribute(
            "aria-label",
            "Delete " + card.name
        );

        deleteButton.title =
            "Delete " + card.name;

        actionCell.appendChild(
            deleteButton
        );

        /* Prevent multiple requests at once */

        function setButtonsDisabled(disabled)
        {
            minusButton.disabled =
                disabled || card.quantity <= 1;

            plusButton.disabled = disabled;

            deleteButton.disabled = disabled;

            quantityText.disabled = disabled;
        }

        /* Change quantity */

        async function updateQuantity(change)
        {
            const newQuantity =
                card.quantity + change;

            if (newQuantity < 1)
            {
                return;
            }

            setButtonsDisabled(true);

            try
            {
                await changeCloudQuantity(
                    card.name,
                    newQuantity
                );

                await loadCloudCollection();
            }
            catch (error)
            {
                console.error(error);

                alert(
                    "Could not update quantity: " +
                    error.message
                );

                setButtonsDisabled(false);
            }
        }

        
        /* Save a manually entered quantity */

        quantityText.addEventListener(
            "change",
            async function()
            {
                const newQuantity =
                    Number(quantityText.value);

                /* Reject invalid quantities */

                if (!Number.isSafeInteger(newQuantity) ||
                    newQuantity < 1)
                {
                    alert(
                        "Please enter a whole number greater than 0."
                    );

                    quantityText.value =
                        card.quantity;

                    return;
                }

                /* Nothing changed */

                if (newQuantity === card.quantity)
                {
                    return;
                }

                setButtonsDisabled(true);

                try
                {
                    await changeCloudQuantity(
                        card.name,
                        newQuantity
                    );

                    await loadCloudCollection();
                }
                catch (error)
                {
                    console.error(error);

                    alert(
                        "Could not update quantity: " +
                        error.message
                    );

                    /* Restore previous quantity */

                    quantityText.value =
                        card.quantity;

                    setButtonsDisabled(false);
                }
            }
        );


        /* Press Enter to finish editing */

        quantityText.addEventListener(
            "keydown",
            function(event)
            {
                if (event.key === "Enter")
                {
                    quantityText.blur();
                }

                if (event.key === "Escape")
                {
                    quantityText.value =
                        card.quantity;

                    quantityText.blur();
                }
            }
        );


        /* Highlight the number when clicked */

        quantityText.addEventListener(
            "focus",
            function()
            {
                quantityText.select();
            }
        );

        minusButton.addEventListener(
            "click",
            async function()
            {
                await updateQuantity(-1);
            }
        );

        plusButton.addEventListener(
            "click",
            async function()
            {
                await updateQuantity(1);
            }
        );

        /* Delete card */

        deleteButton.addEventListener(
            "click",
            async function()
            {
                const confirmed = confirm(
                    "Delete " + card.name +
                    " from your collection?"
                );

                if (!confirmed)
                {
                    return;
                }

                setButtonsDisabled(true);

                try
                {
                    await deleteCloudCard(
                        card.name
                    );

                    await loadCloudCollection();
                }
                catch (error)
                {
                    console.error(error);

                    alert(
                        "Could not delete card: " +
                        error.message
                    );

                    setButtonsDisabled(false);
                }
            }
        );

        /* Add cells to table */

        row.appendChild(nameCell);

        row.appendChild(quantityCell);

        row.appendChild(actionCell);

        table.appendChild(row);
    }

    collectionResults.appendChild(table);
}

/* =========================================
   SEARCH BAR EVENT
   ========================================= */

collectionSearch.addEventListener(
    "input",
    function()
    {
        displayCollection();
    }
);

/* =========================================
   LOAD COLLECTION FROM SUPABASE
   ========================================= */

async function loadCloudCollection()
{
    const { data: userData, error: userError } =
        await supabaseClient.auth.getUser();

    if (userError || !userData.user)
    {
        collection = [];

        displayCollection();

        return;
    }

    const { data, error } =
        await supabaseClient
            .from("collection")
            .select("name, quantity")
            .order("name");

    if (error)
    {
        console.error(error);

        alert(
            "Could not load your collection."
        );

        return;
    }

    collection = data;

    displayCollection();
}

/* Import Button */

importButton.addEventListener("click", async function()
{
    if (collectionFile.files.length === 0)
    {
        alert("Please select a CSV file first.");

        return;
    }

    const file = collectionFile.files[0];

    try
    {
        const csvText = await file.text();

        const importedCards =
            parseCollectionCSV(csvText);

        /* Combine Duplicate Card Names */

        const cardMap = new Map();

        for (const card of importedCards)
        {
            const key =
                card.name.toLowerCase();

            if (cardMap.has(key))
            {
                cardMap.get(key).quantity +=
                    card.quantity;
            }
            else
            {
                cardMap.set(key, {
                    name: card.name,
                    quantity: card.quantity
                });
            }
        }

        const importedCollection =
            Array.from(cardMap.values());

        await saveCloudCollection(
            importedCollection
        );

        await loadCloudCollection();

        alert(
            "Collection saved to your account!"
        );
    }
    catch (error)
    {
        console.error(error);

        alert(error.message);
    }
});



/* =========================================
   LIGHT / DARK MODE
   ========================================= */

const themeToggle =
    document.getElementById("themeToggle");

const savedTheme =
    localStorage.getItem("cardcache-theme");

const systemPrefersLight =
    window.matchMedia(
        "(prefers-color-scheme: light)"
    ).matches;

/* Choose Saved Theme or System Preference */

let currentTheme =
    savedTheme ||
    (systemPrefersLight ? "light" : "dark");

/* Apply Theme */

function applyTheme(theme)
{
    document.documentElement.setAttribute(
        "data-theme",
        theme
    );

    const isLight = theme === "light";

    themeToggle.setAttribute(
        "aria-pressed",
        String(isLight)
    );

    const buttonLabel = isLight
        ? "Switch to dark mode"
        : "Switch to light mode";

    themeToggle.setAttribute(
        "aria-label",
        buttonLabel
    );

    themeToggle.setAttribute(
        "title",
        buttonLabel
    );
}

/* Change Theme When Button Is Clicked */

themeToggle.addEventListener("click", function()
{
    if (currentTheme === "dark")
    {
        currentTheme = "light";
    }
    else
    {
        currentTheme = "dark";
    }

    applyTheme(currentTheme);

    localStorage.setItem(
        "cardcache-theme",
        currentTheme
    );

    console.log("Current theme:", currentTheme);
});

/* Restore Theme on Page Load */

applyTheme(currentTheme);


/* Update Chart Colors When Theme Changes */

function updateChartTheme()
{
    const styles = getComputedStyle(
        document.documentElement
    );

    const accent =
        styles.getPropertyValue("--accent").trim();

    const muted =
        styles.getPropertyValue("--text-muted").trim();

    const grid =
        styles.getPropertyValue("--chart-grid").trim();

    /* Update Line Color */

    priceChart.data.datasets[0].borderColor =
        accent;

    priceChart.data.datasets[0].backgroundColor =
        accent + "22";

    /* Update Axis Colors */

    priceChart.options.scales.x.ticks.color =
        muted;

    priceChart.options.scales.y.ticks.color =
        muted;

    /* Update Grid Colors */

    priceChart.options.scales.x.grid = {
        color: grid
    };

    priceChart.options.scales.y.grid = {
        color: grid
    };

    priceChart.update();
}


/* =========================================
   SCRYFALL CARD LOOKUP
   ========================================= */

async function getCardPrinting(set, collectorNumber)
{
    const url =
        `https://api.scryfall.com/cards/${set}/${collectorNumber}`;

    try
    {
        const response = await fetch(url);

        if (!response.ok)
        {
            throw new Error(
                "Card not found: " + response.status
            );
        }

        const card = await response.json();

        /* Extract the information CardCache needs */

        const cardData = {
            scryfall_id: card.id,

            oracle_id: card.oracle_id ?? null,

            name: card.name,

            set: card.set,

            set_name: card.set_name,

            collector_number: card.collector_number,

            rarity: card.rarity,

            mana_value: card.cmc,

            color_identity: card.color_identity,

            type_line: card.type_line,

            oracle_text: card.oracle_text ?? "",

            commander_legality:
                card.legalities.commander,

            price_usd: card.prices.usd
                ? Number(card.prices.usd)
                : null,

            image_url:
                card.image_uris?.normal ??
                card.card_faces?.[0]?.image_uris?.normal ??
                null
        };

        return cardData;
    }
    catch (error)
    {
        console.error(
            "Scryfall error:",
            error
        );

        return null;
    }
}

async function testCard()
{
    const card = await getCardPrinting(
        "fic",
        "357"
    );

    console.log(card);
}

testCard();

/* =========================================
   USER AUTHENTICATION
   ========================================= */

const accountEmail =
    document.getElementById("accountEmail");

const accountPassword =
    document.getElementById("accountPassword");

const accountStatus =
    document.getElementById("accountStatus");


/* Create Account */

document.getElementById("signUpButton")
    .addEventListener("click", async function()
{
    const { data, error } =
        await supabaseClient.auth.signUp({
            email: accountEmail.value,
            password: accountPassword.value
        });

    if (error)
    {
        alert(error.message);
        return;
    }

    alert(
        data.session
            ? "Account created and signed in!"
            : "Check your email to confirm your account."
    );
});


/* Sign In */

document.getElementById("signInButton")
    .addEventListener("click", async function()
{
    const { error } =
        await supabaseClient.auth.signInWithPassword({
            email: accountEmail.value,
            password: accountPassword.value
        });

    if (error)
    {
        alert(error.message);
        return;
    }

    accountStatus.textContent =
        "Signed in as " + accountEmail.value;

    accountPassword.value = "";

    await loadCloudCollection();
});


/* Sign Out */

document.getElementById("signOutButton")
    .addEventListener("click", async function()
{
    const { error } =
        await supabaseClient.auth.signOut();

    if (error)
    {
        alert(error.message);
        return;
    }

    collection = [];

    displayCollection();

    accountStatus.textContent =
        "Not signed in.";

    accountPassword.value = "";
});

/* =========================================
   SAVE COLLECTION TO SUPABASE
   ========================================= */

async function saveCloudCollection(cards)
{
    const { data: userData, error: userError } =
        await supabaseClient.auth.getUser();

    if (userError || !userData.user)
    {
        throw new Error(
            "Please sign in before importing cards."
        );
    }

    const userId = userData.user.id;

    const rows = cards.map(function(card)
    {
        return {
            user_id: userId,
            name: card.name,
            quantity: card.quantity
        };
    });

    const { error } =
        await supabaseClient
            .from("collection")
            .upsert(rows, {
                onConflict: "user_id,name"
            });

    if (error)
    {
        throw error;
    }
}

/* =========================================
   UPDATE CARD QUANTITY
   ========================================= */

async function changeCloudQuantity(
    cardName,
    newQuantity
)
{
    if (!Number.isInteger(newQuantity) ||
        newQuantity < 1)
    {
        throw new Error(
            "Quantity must be at least 1."
        );
    }

    const { data: userData, error: userError } =
        await supabaseClient.auth.getUser();

    if (userError || !userData.user)
    {
        throw new Error(
            "Please sign in to edit cards."
        );
    }

    const { data, error } =
        await supabaseClient
            .from("collection")
            .update({
                quantity: newQuantity
            })
            .eq(
                "user_id",
                userData.user.id
            )
            .eq(
                "name",
                cardName
            )
            .select("name");

    if (error)
    {
        throw error;
    }

    if (!data || data.length === 0)
    {
        throw new Error(
            "Card was not found in your collection."
        );
    }
}

/* =========================================
   INITIALIZE CARDCACHE
   ========================================= */

async function initializeCardCache()
{
    const { data, error } =
        await supabaseClient.auth.getUser();

    if (!error && data.user)
    {
        accountStatus.textContent =
            "Signed in as " + data.user.email;
    }
    else
    {
        accountStatus.textContent =
            "Not signed in.";
    }

    await loadCloudCollection();
}

/* Run When Page Loads */

initializeCardCache();

/* =========================================
   SCRYFALL LOOKUP BY CARD NAME
   ========================================= */

async function getCardByName(cardName)
{
    const url =
        "https://api.scryfall.com/cards/named?exact=" +
        encodeURIComponent(cardName);

    try
    {
        const response = await fetch(url);

        if (!response.ok)
        {
            throw new Error(
                "Could not find card: " + cardName
            );
        }

        const card = await response.json();

        return {
            scryfall_id: card.id,

            oracle_id: card.oracle_id ?? null,

            name: card.name,

            rarity: card.rarity,

            color_identity: card.color_identity,

            mana_value: card.cmc,

            type_line: card.type_line,

            image_url:
                card.image_uris?.normal ??
                card.card_faces?.[0]?.image_uris?.normal ??
                null
        };
    }
    catch (error)
    {
        console.error(error);

        return null;
    }
}
