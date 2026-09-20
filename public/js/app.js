

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

const collectionValue =
    document.getElementById("collectionValue");

const chartMessage =
    document.getElementById("chartMessage");

const refreshPricesButton =
    document.getElementById("refreshPricesButton");

const priceChartCanvas =
    document.getElementById("priceChart");

let priceChartInstance = null;

/* Selected graph range: 30 days by default */

let selectedRangeDays = 30;

const chartRangeButtons =
    document.querySelectorAll(
        ".chart-range-button"
    );

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

        
    /* =========================================
    CARD NAME AND PRINTING
    ========================================= */

    const nameCell =
        document.createElement("td");

    /* Main card name */

    const cardName =
        document.createElement("div");

    cardName.className =
        "collection-card-name";

    cardName.textContent =
        card.name;

    nameCell.appendChild(cardName);


    /* Set name and collector number */

    const printingInfo =
        document.createElement("div");

    printingInfo.className =
        "collection-printing-info";

    if (card.set_code)
    {
        const setName =
            card.set_name ||
            card.set_code.toUpperCase();

        const collectorNumber =
            card.collector_number || "?";

        printingInfo.textContent =
            setName +
            " · #" +
            collectorNumber;
    }
    else
    {
        printingInfo.textContent =
            "Printing not specified";
    }

    nameCell.appendChild(printingInfo);

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
                    card.id,
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
                        card.id,
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
                        card.id
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

        /* Clear any previous user's value and graph */

        await loadCollectionPricing();

        return;
    }

    const { data, error } =
        await supabaseClient
            .from("collection_entries")
            .select(
                "id, name, quantity, set_code, set_name, collector_number"
                )
            .eq("user_id", userData.user.id)
            .order("name");

    if (error)
    {
        console.error(error);

        alert("Could not load your collection.");

        return;
    }

    collection = data;

    displayCollection();

    await loadCollectionPricing();
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

    await loadCollectionPricing();

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

    /* Get existing cards with unknown printings */

    const { data: existingCards, error: loadError } =
        await supabaseClient
            .from("collection_entries")
            .select("id, name")
            .eq("user_id", userId)
            .is("scryfall_id", null);

    if (loadError)
    {
        throw loadError;
    }

    /* Match existing entries by name */

    const existingMap = new Map();

    for (const card of existingCards)
    {
        existingMap.set(
            card.name.toLowerCase(),
            card.id
        );
    }

    /* Prepare new entries */

    const newCards = [];

    for (const card of cards)
    {
        const key =
            card.name.toLowerCase();

        const existingId =
            existingMap.get(key);

        if (existingId)
        {
            /* Update the existing unresolved card */

            const { error } =
                await supabaseClient
                    .from("collection_entries")
                    .update({
                        quantity: card.quantity
                    })
                    .eq("id", existingId)
                    .eq("user_id", userId);

            if (error)
            {
                throw error;
            }
        }
        else
        {
            /* Create a new unresolved entry */

            newCards.push({
                user_id: userId,
                name: card.name,
                quantity: card.quantity
            });
        }
    }

    /* Insert the new entries together */

    if (newCards.length > 0)
    {
        const { error } =
            await supabaseClient
                .from("collection_entries")
                .insert(newCards);

        if (error)
        {
            throw error;
        }
    }
}

/* =========================================
   UPDATE CARD QUANTITY
   ========================================= */

async function changeCloudQuantity(
    entryId,
    newQuantity
)
{
    if (!Number.isSafeInteger(newQuantity) ||
        newQuantity < 1)
    {
        throw new Error(
            "Quantity must be a whole number of at least 1."
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
            .from("collection_entries")
            .update({
                quantity: newQuantity
            })
            .eq("id", entryId)
            .eq("user_id", userData.user.id)
            .select("id");

    if (error)
    {
        throw error;
    }

    if (!data || data.length === 0)
    {
        throw new Error(
            "Collection entry was not found."
        );
    }
}


/* =========================================
   DELETE COLLECTION ENTRY
   ========================================= */

async function deleteCloudCard(entryId)
{
    const { data: userData, error: userError } =
        await supabaseClient.auth.getUser();

    if (userError || !userData.user)
    {
        throw new Error(
            "Please sign in to delete cards."
        );
    }

    const { data, error } =
        await supabaseClient
            .from("collection_entries")
            .delete()
            .eq("id", entryId)
            .eq("user_id", userData.user.id)
            .select("id");

    if (error)
    {
        throw error;
    }

    if (!data || data.length === 0)
    {
        throw new Error(
            "Collection entry was not found."
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


/* =========================================
   MANUALLY ADD CARDS
   ========================================= */

const addCardButton =
    document.getElementById("addCardButton");

const addCardPanel =
    document.getElementById("addCardPanel");

const scryfallSearch =
    document.getElementById("scryfallSearch");

const scryfallSearchButton =
    document.getElementById("scryfallSearchButton");

const scryfallSearchStatus =
    document.getElementById("scryfallSearchStatus");

const scryfallResults =
    document.getElementById("scryfallResults");

const printingSection =
    document.getElementById("printingSection");

const printingStatus =
    document.getElementById("printingStatus");

const printingResults =
    document.getElementById("printingResults");

const loadMorePrintings =
    document.getElementById("loadMorePrintings");

const selectedCardSection =
    document.getElementById("selectedCardSection");

const selectedCardPreview =
    document.getElementById("selectedCardPreview");

const cardFinish =
    document.getElementById("cardFinish");

const cardQuantity =
    document.getElementById("cardQuantity");

const confirmAddCard =
    document.getElementById("confirmAddCard");

const addCardStatus =
    document.getElementById("addCardStatus");


/* Currently selected Scryfall printing */

let selectedPrinting = null;

/* Pagination for cards with many printings */

let nextPrintingsPage = null;


/* =========================================
   OPEN / CLOSE ADD CARD PANEL
   ========================================= */

addCardButton.addEventListener(
    "click",
    function()
    {
        addCardPanel.hidden =
            !addCardPanel.hidden;

        if (!addCardPanel.hidden)
        {
            scryfallSearch.focus();
        }
    }
);


/* =========================================
   SEARCH CARD NAMES
   ========================================= */

async function searchScryfallCards()
{
    const searchText =
        scryfallSearch.value.trim();

    
    /* =========================================
    CHECK FOR SPECIFIC PRINTING
    ========================================= */

    /* Examples:
    fic/357
    Sol Ring fic/357
    */

    const directMatch = searchText.match(
        /^(?:(.+?)\s+)?([a-z0-9]{2,8})\/([0-9][0-9a-z★*-]*)$/i
    );

    if (directMatch)
    {
        const cardName =
            directMatch[1]?.trim() || "";

        const setCode =
            directMatch[2].toLowerCase();

        const collectorNumber =
            directMatch[3];

        await searchExactPrinting(
            setCode,
            collectorNumber,
            cardName
        );

        return;
    }


    /* =========================================
    CHECK FOR CARD NAME + NUMBER
    ========================================= */

    /* Example: Sol Ring 2783 */

    const nameNumberMatch = searchText.match(
        /^(.+?)\s+([0-9][0-9a-z★*-]*)$/i
    );

    if (nameNumberMatch)
    {
        const cardName =
            nameNumberMatch[1].trim();

        const collectorNumber =
            nameNumberMatch[2];

        await searchCardByNameAndNumber(
            cardName,
            collectorNumber
        );

        return;
    }

    
    
    if (searchText.length < 2)
    {
        scryfallSearchStatus.textContent =
            "Enter at least 2 characters.";

        return;
    }

    scryfallResults.replaceChildren();

    printingSection.hidden = true;

    selectedCardSection.hidden = true;

    selectedPrinting = null;

    scryfallSearchButton.disabled = true;

    scryfallSearchStatus.textContent =
        "Searching Scryfall...";

    try
    {
        const url =
            "https://api.scryfall.com/cards/autocomplete?q=" +
            encodeURIComponent(searchText);

        const response = await fetch(url);

        if (!response.ok)
        {
            throw new Error(
                "Scryfall search failed: " +
                response.status
            );
        }

        const result = await response.json();

        if (result.data.length === 0)
        {
            scryfallSearchStatus.textContent =
                "No matching cards found.";

            return;
        }

        scryfallSearchStatus.textContent =
            "Select a card:";

        for (const cardName of result.data)
        {
            const button =
                document.createElement("button");

            button.type = "button";

            button.className =
                "scryfall-name-result";

            button.textContent =
                cardName;

            button.addEventListener(
                "click",
                function()
                {
                    showCardPrintings(cardName);
                }
            );

            scryfallResults.appendChild(
                button
            );
        }
    }
    catch (error)
    {
        console.error(error);

        scryfallSearchStatus.textContent =
            error.message;
    }
    finally
    {
        scryfallSearchButton.disabled =
            false;
    }
}


/* =========================================
   SEARCH CARD NAME + COLLECTOR NUMBER
   ========================================= */

async function searchCardByNameAndNumber(
    cardName,
    collectorNumber
)
{
    scryfallResults.replaceChildren();

    selectedCardSection.hidden = true;

    selectedPrinting = null;

    printingSection.hidden = false;

    printingResults.replaceChildren();

    printingStatus.textContent =
        "Searching for " +
        cardName + " #" +
        collectorNumber + "...";

    /* Search exact name and collector number */

    const query =
        '!"' + cardName + '" cn:' +
        collectorNumber;

    const url =
        "https://api.scryfall.com/cards/search?q=" +
        encodeURIComponent(query) +
        "&unique=prints";

    nextPrintingsPage = null;

    await loadPrintingPage(url);
}

/* Search Button */

scryfallSearchButton.addEventListener(
    "click",
    searchScryfallCards
);


/* Allow Enter in the search field */

scryfallSearch.addEventListener(
    "keydown",
    function(event)
    {
        if (event.key === "Enter")
        {
            event.preventDefault();

            searchScryfallCards();
        }
    }
);


/* =========================================
   FIND AVAILABLE PRINTINGS
   ========================================= */

async function showCardPrintings(cardName)
{
    printingSection.hidden = false;

    selectedCardSection.hidden = true;

    selectedPrinting = null;

    printingResults.replaceChildren();

    printingStatus.textContent =
        "Loading printings for " +
        cardName + "...";

    /* Exact card-name search */

    const query =
        '!"' + cardName + '"';

    const url =
        "https://api.scryfall.com/cards/search?q=" +
        encodeURIComponent(query) +
        "&unique=prints&order=released&dir=desc";

    nextPrintingsPage = null;

    await loadPrintingPage(url);
}


/* =========================================
   LOAD A PAGE OF PRINTINGS
   ========================================= */

async function loadPrintingPage(url)
{
    loadMorePrintings.hidden = true;

    try
    {
        const response = await fetch(url);

        if (!response.ok)
        {
            throw new Error(
                "Could not load printings: " +
                response.status
            );
        }

        const result = await response.json();

        for (const printing of result.data)
        {
            const button =
                document.createElement("button");

            button.type = "button";

            button.className =
                "printing-option";

            const imageURL =
                printing.image_uris?.small ??
                printing.card_faces?.[0]?.image_uris?.small ??
                null;

            if (imageURL)
            {
                const image =
                    document.createElement("img");

                image.src = imageURL;

                image.alt =
                    printing.name;

                button.appendChild(image);
            }

            const details =
                document.createElement("span");

            details.textContent =
                printing.set_name +
                " — #" +
                printing.collector_number +
                " — " +
                printing.rarity;

            button.appendChild(details);

            button.addEventListener(
                "click",
                function()
                {
                    selectCardPrinting(
                        printing
                    );
                }
            );

            printingResults.appendChild(
                button
            );
        }

        printingStatus.textContent =
            "Choose the set and artwork you own.";

        nextPrintingsPage =
            result.has_more
                ? result.next_page
                : null;

        loadMorePrintings.hidden =
            !nextPrintingsPage;
    }
    catch (error)
    {
        console.error(error);

        printingStatus.textContent =
            error.message;
    }
}


/* Load additional printings */

loadMorePrintings.addEventListener(
    "click",
    async function()
    {
        if (!nextPrintingsPage)
        {
            return;
        }

        const url = nextPrintingsPage;

        nextPrintingsPage = null;

        await loadPrintingPage(url);
    }
);


/* =========================================
   SELECT AN EXACT PRINTING
   ========================================= */

function selectCardPrinting(printing)
{
    selectedPrinting = printing;

    selectedCardSection.hidden = false;

    selectedCardPreview.replaceChildren();

    addCardStatus.textContent = "";

    /* Card artwork */

    const imageURL =
        printing.image_uris?.normal ??
        printing.card_faces?.[0]?.image_uris?.normal ??
        null;

    if (imageURL)
    {
        const image =
            document.createElement("img");

        image.src = imageURL;

        image.alt = printing.name;

        selectedCardPreview.appendChild(
            image
        );
    }

    /* Selected printing information */

    const description =
        document.createElement("p");

    description.textContent =
        printing.name +
        " — " +
        printing.set_name +
        " #" +
        printing.collector_number +
        " — " +
        printing.rarity;

    selectedCardPreview.appendChild(
        description
    );

    /* Display available finishes */

    cardFinish.replaceChildren();

    for (const finish of printing.finishes)
    {
        const option =
            document.createElement("option");

        option.value = finish;

        option.textContent = finish;

        cardFinish.appendChild(option);
    }

    cardQuantity.value = "1";

    selectedCardSection.scrollIntoView({
        behavior: "smooth",
        block: "nearest"
    });
}


/* =========================================
   ADD PRINTING TO SUPABASE
   ========================================= */

confirmAddCard.addEventListener(
    "click",
    async function()
    {
        if (!selectedPrinting)
        {
            return;
        }

        const quantity =
            Number(cardQuantity.value);

        if (!Number.isSafeInteger(quantity) ||
            quantity < 1)
        {
            addCardStatus.textContent =
                "Enter a whole number of at least 1.";

            return;
        }

        confirmAddCard.disabled = true;

        addCardStatus.textContent =
            "Saving card...";

        try
        {
            await addPrintingToCollection(
                selectedPrinting,
                cardFinish.value,
                quantity
            );

            await loadCloudCollection();

            addCardStatus.textContent =
                "Card added successfully!";
        }
        catch (error)
        {
            console.error(error);

            addCardStatus.textContent =
                "Could not add card: " +
                error.message;
        }
        finally
        {
            confirmAddCard.disabled = false;
        }
    }
);

/* =========================================
   DIRECT PRINTING LOOKUP
   ========================================= */

async function searchExactPrinting(
    setCode,
    collectorNumber,
    expectedName = ""
)
{
    scryfallSearchStatus.textContent =
        "Finding exact printing...";

    scryfallResults.replaceChildren();

    printingSection.hidden = true;

    selectedCardSection.hidden = true;

    selectedPrinting = null;

    try
    {
        const url =
            "https://api.scryfall.com/cards/" +
            encodeURIComponent(setCode) + "/" +
            encodeURIComponent(collectorNumber);

        const response = await fetch(url);

        if (!response.ok)
        {
            throw new Error(
                "No printing found for " +
                setCode + " #" + collectorNumber
            );
        }

        const printing =
            await response.json();

        /* Check the name if one was supplied */

        if (expectedName &&
            printing.name.toLowerCase() !==
            expectedName.toLowerCase())
        {
            throw new Error(
                "That set and number belong to " +
                printing.name + ", not " +
                expectedName + "."
            );
        }

        scryfallSearchStatus.textContent =
            "Exact printing found!";

        /* Use your existing selection interface */

        selectCardPrinting(printing);
    }
    catch (error)
    {
        console.error(error);

        scryfallSearchStatus.textContent =
            error.message;
    }
}

/* =========================================
   SAVE EXACT PRINTING
   ========================================= */

async function addPrintingToCollection(
    printing,
    finish,
    quantity
)
{
    const { data: userData, error: userError } =
        await supabaseClient.auth.getUser();

    if (userError || !userData.user)
    {
        throw new Error(
            "Please sign in before adding cards."
        );
    }

    const userId =
        userData.user.id;

    /* Does this user already own this printing? */

    const { data: existing, error: findError } =
        await supabaseClient
            .from("collection_entries")
            .select("id, quantity")
            .eq("user_id", userId)
            .eq("scryfall_id", printing.id)
            .eq("finish", finish)
            .maybeSingle();

    if (findError)
    {
        throw findError;
    }

    if (existing)
    {
        /* Add to the existing quantity */

        const { error } =
            await supabaseClient
                .from("collection_entries")
                .update({
                    quantity:
                        existing.quantity + quantity
                })
                .eq("id", existing.id)
                .eq("user_id", userId);

        if (error)
        {
            throw error;
        }

        return;
    }

    /* Choose the correct price for the finish */

    let price = null;

    if (finish === "nonfoil")
    {
        price = printing.prices.usd;
    }
    else if (finish === "foil")
    {
        price = printing.prices.usd_foil;
    }
    else if (finish === "etched")
    {
        price = printing.prices.usd_etched;
    }

    const imageURL =
        printing.image_uris?.normal ??
        printing.card_faces?.[0]?.image_uris?.normal ??
        null;

    /* Create a new printing-specific entry */

    const newEntry = {
        user_id: userId,

        name: printing.name,

        quantity: quantity,

        scryfall_id: printing.id,

        oracle_id:
            printing.oracle_id ?? null,

        set_code: printing.set,

        set_name: printing.set_name,

        collector_number:
            printing.collector_number,

        finish: finish,

        rarity: printing.rarity,

        color_identity:
            printing.color_identity,

        mana_value: printing.cmc,

        type_line: printing.type_line,

        image_url: imageURL,

        price_usd: price
            ? Number(price)
            : null
    };

    const { error } =
        await supabaseClient
            .from("collection_entries")
            .insert(newEntry);

    if (error)
    {
        throw error;
    }
}

/* =========================================
   REFRESH COLLECTION PRICES
   ========================================= */

refreshPricesButton.addEventListener(
    "click",
    async function()
    {
        refreshPricesButton.disabled = true;

        refreshPricesButton.textContent =
            "Refreshing...";

        chartMessage.textContent =
            "Checking your collection's prices...";

        try
        {
            const { data, error } =
                await supabaseClient.functions.invoke(
                    "refresh-collection-prices"
                );

            if (error)
            {
                throw error;
            }

            /* If we successfully refreshed,
               reload the collection's value
               and graph from Supabase. */

            await loadCollectionPricing();

            console.log(
                "Price refresh complete:",
                data
            );
        }
        catch (error)
        {
            console.error(error);

            chartMessage.textContent =
                "Could not refresh prices. " +
                "Check the console and Edge Function logs.";
        }
        finally
        {
            refreshPricesButton.disabled = false;

            refreshPricesButton.textContent =
                "Refresh Prices";
        }
    }
);

/* =========================================
   DISPLAY COLLECTION PRICING
   ========================================= */

async function loadCollectionPricing()
{
    const { data: userData, error: userError } =
        await supabaseClient.auth.getUser();

    if (userError || !userData.user)
    {
        collectionValue.textContent = "—";

        chartMessage.textContent =
            "Sign in to view your collection value.";

        if (priceChartInstance)
        {
            priceChartInstance.destroy();

            priceChartInstance = null;
        }

        return;
    }

    const { data, error } =
        await supabaseClient
            .from("collection_value_snapshots")
            .select(
                "snapshot_date, total_value_usd, priced_copies, unpriced_copies"
            )
            .eq(
                "user_id",
                userData.user.id
            )
            .order(
                "snapshot_date",
                { ascending: false }
            )
            .limit(750);

    if (error)
    {
        throw error;
    }

    if (data.length === 0)
    {
        collectionValue.textContent = "—";

        chartMessage.textContent =
            "Refresh Prices to start " +
            "tracking your collection value.";

        return;
    }

    /* =========================================
    FILTER COLLECTION HISTORY BY DATE
    ========================================= */

    /* Supabase returned newest first */

    const allSnapshots =
        [...data].reverse();

    /* Latest saved value, regardless of graph range */

    const latest =
        allSnapshots[
            allSnapshots.length - 1
        ];

    /* Calculate the first day to display */

    const todayUTC =
        new Date().toISOString().slice(0, 10);

    const cutoffDate =
        new Date(
            todayUTC + "T00:00:00Z"
        );

    cutoffDate.setUTCDate(
        cutoffDate.getUTCDate() -
        (selectedRangeDays - 1)
    );

    const cutoffText =
        cutoffDate.toISOString().slice(0, 10);

    /* Keep snapshots within the chosen range */

    const snapshots =
        allSnapshots.filter(
            function(snapshot)
            {
                return snapshot.snapshot_date >=
                    cutoffText;
            }
        );

    collectionValue.textContent =
        Number(
            latest.total_value_usd
        ).toLocaleString(
            "en-US",
            {
                style: "currency",
                currency: "USD"
            }
        );

    const firstValue =
        Number(
            snapshots[0].total_value_usd
        );

    const currentValue =
        Number(
            latest.total_value_usd
        );

    const change =
        currentValue - firstValue;

    const changeText =
        change.toLocaleString(
            "en-US",
            {
                style: "currency",
                currency: "USD",
                signDisplay: "always"
            }
        );

    /* Nothing recorded in this date range */

    if (snapshots.length === 0)
    {
        if (priceChartInstance)
        {
            priceChartInstance.destroy();

            priceChartInstance = null;
        }

        chartMessage.textContent =
            "No collection history recorded " +
            "in this date range.";

        return;
    }

    chartMessage.textContent =
        latest.priced_copies +
        " priced copies · " +
        latest.unpriced_copies +
        " unpriced copies. " +
        "Change over displayed history: " +
        changeText +
        ".";

    /* Remove previous chart before redrawing */

    if (priceChartInstance)
    {
        priceChartInstance.destroy();
    }

    priceChartInstance = new Chart(
        priceChartCanvas,
        {
            type: "line",

            data: {
                labels:
                    snapshots.map(
                        item =>
                            item.snapshot_date
                    ),

                datasets: [
                    {
                        label:
                            "Collection Value (USD)",

                        data:
                            snapshots.map(
                                item =>
                                    Number(
                                        item.total_value_usd
                                    )
                            ),

                        tension: 0.2,

                        fill: false
                    }
                ]
            },

            options: {
                responsive: true,

                maintainAspectRatio: false,

                scales: {

                    x: {
                        ticks: {
                            autoSkip: true,
                            maxTicksLimit: 6,
                            maxRotation: 0
                        }
                    },

                    y: {
                        ticks: {
                            callback:
                                value =>
                                    "$" + value
                        }
                    }

                }
            }
        }
    );
}

/* =========================================
   COLLECTION GRAPH DATE RANGES
   ========================================= */

for (const button of chartRangeButtons)
{
    button.addEventListener(
        "click",
        async function()
        {
            /* Update selected range */

            selectedRangeDays =
                Number(button.dataset.days);

            /* Update active button styling */

            for (const otherButton of chartRangeButtons)
            {
                otherButton.classList.toggle(
                    "active",
                    otherButton === button
                );
            }

            /* Redraw with selected dates */

            try
            {
                await loadCollectionPricing();
            }
            catch (error)
            {
                console.error(error);

                chartMessage.textContent =
                    "Could not load collection history.";
            }
        }
    );
}