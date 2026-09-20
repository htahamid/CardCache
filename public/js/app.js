

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

/* =========================================
   COLLECTION FILTER CONTROLS
   ========================================= */

const collectionFilters =
    document.createElement("div");

collectionFilters.className =
    "collection-card-filters";

collectionFilters.innerHTML = `
    <label>
        Color identity
        <select id="collectionColorFilter">
            <option value="">All colors</option>
            <option value="W">White</option>
            <option value="U">Blue</option>
            <option value="B">Black</option>
            <option value="R">Red</option>
            <option value="G">Green</option>
            <option value="C">Colorless</option>

            <option value="mono">Any Monocolor</option>
            <option value="mono:W">Mono-White</option>
            <option value="mono:U">Mono-Blue</option>
            <option value="mono:B">Mono-Black</option>
            <option value="mono:R">Mono-Red</option>
            <option value="mono:G">Mono-Green</option>
        </select>
    </label>

    <label>
        Mana value
        <select id="collectionManaFilter">
            <option value="">Any mana value</option>
            ${Array.from(
                { length: 11 },
                (_, value) =>
                    `<option value="${value}">
                        ${value}
                    </option>`
            ).join("")}
            <option value="11+">11+</option>
        </select>
    </label>

    <label>
        Rarity
        <select id="collectionRarityFilter">
            <option value="">All rarities</option>
            <option value="common">Common</option>
            <option value="uncommon">Uncommon</option>
            <option value="rare">Rare</option>
            <option value="mythic">Mythic Rare</option>
        </select>
    </label>
`;

/* Collapsible collection filter menu */

const collectionFilterMenu =
    document.createElement("details");

collectionFilterMenu.className =
    "collection-filter-menu";

const collectionFilterToggle =
    document.createElement("summary");

collectionFilterToggle.textContent =
    "⚙ Filters";

collectionFilterMenu.appendChild(
    collectionFilterToggle
);

collectionFilterMenu.appendChild(
    collectionFilters
);

collectionSearch.insertAdjacentElement(
    "afterend",
    collectionFilterMenu
);

const collectionColorFilter =
    document.getElementById(
        "collectionColorFilter"
    );

const collectionManaFilter =
    document.getElementById(
        "collectionManaFilter"
    );

const collectionRarityFilter =
    document.getElementById(
        "collectionRarityFilter"
    );

/* Selected graph range: 30 days by default */

let selectedRangeDays = 30;

const chartRangeButtons =
    document.querySelectorAll(
        ".chart-range-button"
    );


/* Collection table pagination */

let collectionPage = 1;
let collectionPageSize = 25;

/* =========================================
   PRICES DISPLAYED IN YOUR COLLECTION
   ========================================= */

let collectionPrices = new Map();


function collectionPriceKey(card)
{
    return (
        card.scryfall_id +
        "|" +
        (card.finish || "nonfoil")
    );
}


function getCollectionCardPrice(card)
{
    if (!card.scryfall_id)
    {
        return null;
    }

    const price =
        collectionPrices.get(
            collectionPriceKey(card)
        );

    return price === undefined
        ? null
        : price;
}


function formatCollectionMoney(value)
{
    return value.toLocaleString(
        "en-US",
        {
            style: "currency",
            currency: "USD"
        }
    );
}


/* Load saved prices, then fill gaps
   using each exact Scryfall printing */

async function loadCollectionCardPrices()
{
    collectionPrices = new Map();

    const ids = [
        ...new Set(
            collection
                .filter(card => card.scryfall_id)
                .map(card => card.scryfall_id)
        )
    ];

    /* Read existing Supabase prices */

    for (let start = 0; start < ids.length; start += 75)
    {
        const batch =
            ids.slice(start, start + 75);

        const { data, error } =
            await supabaseClient
                .from("card_prices")
                .select(
                    "scryfall_id, finish, price_usd"
                )
                .in("scryfall_id", batch);

        if (error)
        {
            throw error;
        }

        for (const row of data)
        {
            collectionPrices.set(
                row.scryfall_id + "|" + row.finish,

                row.price_usd === null
                    ? null
                    : Number(row.price_usd)
            );
        }
    }

    /* Identify owned printings with
       no usable saved price */

    const missingIds = [
        ...new Set(
            collection
                .filter(card =>
                    card.scryfall_id &&
                    getCollectionCardPrice(card) === null
                )
                .map(card => card.scryfall_id)
        )
    ];

    /* Ask Scryfall for exact missing IDs */

    for (
        let start = 0;
        start < missingIds.length;
        start += 75
    )
    {
        const batch =
            missingIds.slice(start, start + 75);

        const response = await fetch(
            "https://api.scryfall.com/cards/collection",
            {
                method: "POST",

                headers: {
                    "Content-Type":
                        "application/json",

                    "Accept":
                        "application/json"
                },

                body: JSON.stringify({
                    identifiers:
                        batch.map(id => ({ id: id }))
                })
            }
        );

        if (!response.ok)
        {
            console.warn(
                "Could not retrieve missing collection prices:",
                response.status
            );

            continue;
        }

        const result =
            await response.json();

        for (const printing of result.data)
        {
            const finishPrices = {
                nonfoil: printing.prices.usd,
                foil: printing.prices.usd_foil,
                etched: printing.prices.usd_etched
            };

            for (
                const [finish, rawPrice]
                of Object.entries(finishPrices)
            )
            {
                const key =
                    printing.id + "|" + finish;

                /* Keep an existing valid price */

                if (
                    collectionPrices.has(key) &&
                    collectionPrices.get(key) !== null
                )
                {
                    continue;
                }

                collectionPrices.set(
                    key,

                    rawPrice === null ||
                    rawPrice === undefined
                        ? null
                        : Number(rawPrice)
                );
            }
        }

        /* Avoid sending large batches
           back-to-back */

        if (start + 75 < missingIds.length)
        {
            await new Promise(
                resolve => setTimeout(resolve, 650)
            );
        }
    }
}

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


/* =========================================
   PARSE PRINTING-AWARE COLLECTION CSV
   ========================================= */

function parseCollectionCSV(csvText)
{
    const lines = csvText
        .replace(/^\uFEFF/, "")
        .split(/\r?\n/)
        .filter(line => line.trim() !== "");

    if (lines.length < 2)
    {
        throw new Error(
            "CSV must contain a header and cards."
        );
    }

    const headers = parseCSVLine(lines[0])
        .map(header => header.trim().toLowerCase());

    const requiredHeaders = [
        "name",
        "quantity",
        "set_code",
        "collector_number",
        "finish"
    ];

    for (const header of requiredHeaders)
    {
        if (!headers.includes(header))
        {
            throw new Error(
                "CSV is missing column: " + header
            );
        }
    }

    const importedCards = [];

    for (let i = 1; i < lines.length; i++)
    {
        const values =
            parseCSVLine(lines[i]);

        function column(header)
        {
            return (
                values[headers.indexOf(header)] || ""
            ).trim();
        }

        const name =
            column("name");

        const quantity =
            Number(column("quantity"));

        const setCode =
            column("set_code").toLowerCase();

        const collectorNumber =
            column("collector_number");

        const finish =
            column("finish").toLowerCase();

        if (!name ||
            !Number.isSafeInteger(quantity) ||
            quantity < 1 ||
            !setCode ||
            !collectorNumber)
        {
            throw new Error(
                "Invalid card on CSV line " +
                (i + 1)
            );
        }

        if (![
            "nonfoil",
            "foil",
            "etched"
        ].includes(finish))
        {
            throw new Error(
                "Invalid finish on CSV line " +
                (i + 1) +
                ". Use nonfoil, foil, or etched."
            );
        }

        importedCards.push({
            name: name,
            quantity: quantity,
            set_code: setCode,
            collector_number: collectorNumber,
            finish: finish
        });
    }

    return importedCards;
}

/* =========================================
   VERIFY IMPORTED PRINTINGS
   ========================================= */

async function verifyImportedPrintings(cards)
{
    const verifiedCards = [];

    for (
        let start = 0;
        start < cards.length;
        start += 75
    )
    {
        const batch =
            cards.slice(start, start + 75);

        const response = await fetch(
            "https://api.scryfall.com/cards/collection",
            {
                method: "POST",

                headers: {
                    "Content-Type":
                        "application/json",

                    "Accept":
                        "application/json"
                },

                body: JSON.stringify({
                    identifiers:
                        batch.map(function(card)
                        {
                            return {
                                set: card.set_code,

                                collector_number:
                                    card.collector_number
                            };
                        })
                })
            }
        );

        if (!response.ok)
        {
            throw new Error(
                "Scryfall lookup failed: " +
                response.status
            );
        }

        const result =
            await response.json();

        for (const imported of batch)
        {
            const printing =
                result.data.find(function(card)
                {
                    return (
                        card.set.toLowerCase() ===
                            imported.set_code &&

                        card.collector_number
                            .toLowerCase() ===
                            imported.collector_number
                                .toLowerCase()
                    );
                });

            if (!printing)
            {
                throw new Error(
                    "Printing not found: " +
                    imported.name +
                    " (" +
                    imported.set_code.toUpperCase() +
                    ") " +
                    imported.collector_number
                );
            }

            if (
                printing.name.toLowerCase() !==
                imported.name.toLowerCase()
            )
            {
                throw new Error(
                    imported.set_code.toUpperCase() +
                    " #" +
                    imported.collector_number +
                    " is " +
                    printing.name +
                    ", not " +
                    imported.name
                );
            }

            if (!printing.finishes.includes(
                imported.finish
            ))
            {
                throw new Error(
                    imported.name +
                    " (" +
                    imported.set_code.toUpperCase() +
                    ") " +
                    imported.collector_number +
                    " does not have finish: " +
                    imported.finish
                );
            }

            verifiedCards.push({
                printing: printing,

                finish: imported.finish,

                quantity: imported.quantity
            });
        }

        /* Space out larger imports */

        if (start + 75 < cards.length)
        {
            await new Promise(
                resolve => setTimeout(resolve, 650)
            );
        }
    }

    return verifiedCards;
}

/* Display Collection on Homepage */

function displayCollection()
{
    collectionResults.innerHTML = "";

    let total = 0;

    const rarityCounts = {
        common: 0,
        uncommon: 0,
        rare: 0,
        mythic: 0
    };

    /* Count all owned copies */

    for (const card of collection)
    {
        total += card.quantity;

        const rarity =
            (card.rarity || "").toLowerCase();

        if (rarityCounts[rarity] !== undefined)
        {
            rarityCounts[rarity] +=
                card.quantity;
        }
    }

    /* Update collection overview */

    totalCards.textContent = total;

    document.getElementById("commonCards")
        .textContent = rarityCounts.common;

    document.getElementById("uncommonCards")
        .textContent = rarityCounts.uncommon;

    document.getElementById("rareCards")
        .textContent = rarityCounts.rare;

    document.getElementById("mythicCards")
        .textContent = rarityCounts.mythic;

    /* =========================================
   SEARCH COLLECTION
   ========================================= */

    const visibleCards =
        getFilteredCollectionCards();

    /* Calculate which entries belong on this page */

const pageCount = Math.max(
    1,
    Math.ceil(
        visibleCards.length / collectionPageSize
    )
);

/* Stay on a valid page after deleting cards */

collectionPage = Math.min(
    Math.max(collectionPage, 1),
    pageCount
);

const startIndex =
    (collectionPage - 1) * collectionPageSize;

const pageCards =
    visibleCards.slice(
        startIndex,
        startIndex + collectionPageSize
    );

searchStatus.textContent =
    "Showing " +
    (visibleCards.length ? startIndex + 1 : 0) +
    "–" +
    Math.min(
        startIndex + collectionPageSize,
        visibleCards.length
    ) +
    " of " +
    visibleCards.length +
    " matching entries (" +
    collection.length +
    " total)";

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

    for (const card of pageCards)
    {
        const row =
            document.createElement("tr");

        
    /* =========================================
    CARD NAME AND PRINTING
    ========================================= */

    const nameCell =
        document.createElement("td");

    /* Compact image + card information */

const nameRow =
    document.createElement("div");

nameRow.className =
    "collection-card-name-row";

const nameDetails =
    document.createElement("div");

nameDetails.className =
    "collection-card-details";

if (card.image_url)
{
    const thumbnail =
        document.createElement("img");

    thumbnail.src =
        card.image_url;

    thumbnail.alt =
        card.name + " card";

    thumbnail.loading = "lazy";

    thumbnail.className =
        "collection-card-thumbnail";

    nameRow.appendChild(thumbnail);
}
    
    /* Main card name */

    const cardName =
        document.createElement("div");

    cardName.className =
        "collection-card-name";

    cardName.textContent =
        card.name;

    nameDetails.appendChild(cardName);


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

    nameDetails.appendChild(printingInfo);

    /* =====================================
   PER-COPY AND TOTAL PRINTING VALUE
   ===================================== */

const priceInfo =
    document.createElement("div");

priceInfo.className =
    "collection-card-price";

const unitPrice =
    getCollectionCardPrice(card);

if (unitPrice === null)
{
    priceInfo.textContent =
        "Price unavailable";
}
else
{
    const totalValue =
        unitPrice * card.quantity;

    priceInfo.textContent =
        formatCollectionMoney(unitPrice) +
        " per copy · " +
        formatCollectionMoney(totalValue) +
        " total";
}

        nameDetails.appendChild(priceInfo);

        /* Finish the image + card information layout */

        nameRow.appendChild(nameDetails);

        nameCell.appendChild(nameRow);

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

                await reloadCollectionAfterQuantityChange();
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

                    await reloadCollectionAfterQuantityChange();
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

/* =====================================
   COLLECTION PAGINATION CONTROLS
   ===================================== */

function createCollectionPagination()
{
    const pagination =
    document.createElement("div");

pagination.className =
    "collection-pagination";

/* Previous page */

const previousButton =
    document.createElement("button");

previousButton.type = "button";
previousButton.textContent = "← Previous";

previousButton.disabled =
    collectionPage === 1;

previousButton.addEventListener(
    "click",
    function()
    {
        collectionPage--;

        displayCollection();

        collectionResults.scrollIntoView({
            behavior: "smooth",
            block: "start"
        });
    }
);

/* Choose a specific page */

const pageLabel =
    document.createElement("label");

pageLabel.textContent = "Page ";

const pageSelect =
    document.createElement("select");

for (let page = 1; page <= pageCount; page++)
{
    const option =
        document.createElement("option");

    option.value = page;
    option.textContent = page;

    pageSelect.appendChild(option);
}

pageSelect.value = collectionPage;

pageSelect.addEventListener(
    "change",
    function()
    {
        collectionPage =
            Number(pageSelect.value);

        displayCollection();

        collectionResults.scrollIntoView({
            behavior: "smooth",
            block: "start"
        });
    }
);

pageLabel.appendChild(pageSelect);

/* Show the total number of pages */

const pageTotal =
    document.createElement("span");

pageTotal.textContent =
    "of " + pageCount;

/* Next page */

const nextButton =
    document.createElement("button");

nextButton.type = "button";
nextButton.textContent = "Next →";

nextButton.disabled =
    collectionPage === pageCount;

nextButton.addEventListener(
    "click",
    function()
    {
        collectionPage++;

        displayCollection();

        collectionResults.scrollIntoView({
            behavior: "smooth",
            block: "start"
        });
    }
);

/* Entries per page */

const sizeLabel =
    document.createElement("label");

sizeLabel.textContent = "Show ";

const sizeSelect =
    document.createElement("select");

for (const size of [25, 50, 100])
{
    const option =
        document.createElement("option");

    option.value = size;
    option.textContent = size;

    sizeSelect.appendChild(option);
}

sizeSelect.value = collectionPageSize;

sizeSelect.addEventListener(
    "change",
    function()
    {
        collectionPageSize =
            Number(sizeSelect.value);

        collectionPage = 1;

        displayCollection();
    }
);

sizeLabel.appendChild(sizeSelect);

/* Assemble controls */

pagination.appendChild(previousButton);
pagination.appendChild(pageLabel);
pagination.appendChild(pageTotal);
pagination.appendChild(nextButton);
pagination.appendChild(sizeLabel);

    return pagination;
}


/* Pagination above and below the cards */

collectionResults.appendChild(
    createCollectionPagination()
);

collectionResults.appendChild(table);

collectionResults.appendChild(
    createCollectionPagination()
);
}

/* =========================================
   SEARCH BAR EVENT
   ========================================= */

collectionSearch.addEventListener(
    "input",
    function()
    {
        collectionPage = 1;

        displayCollection();

        loadCollectionPricing().catch(console.error);
    }
);

/* Redraw when any collection filter changes */

for (const filter of [
    collectionColorFilter,
    collectionManaFilter,
    collectionRarityFilter
])
{
    filter.addEventListener(
        "change",
        function()
        {
            collectionPage = 1;

            displayCollection();

            loadCollectionPricing().catch(console.error);
        }
    );
}

/* =========================================
   REMOVE ALL OWNED COLLECTION ENTRIES
   ========================================= */

const clearCollectionButton =
    document.getElementById(
        "clearCollectionButton"
    );

clearCollectionButton.addEventListener(
    "click",
    async function()
    {
        const { data: userData, error: userError } =
            await supabaseClient.auth.getUser();

        if (userError || !userData.user)
        {
            alert(
                "Please sign in before removing cards."
            );

            return;
        }

        const confirmation = prompt(
            "This will permanently delete ALL " +
            "collection entries in your account, " +
            "not just the current page.\n\n" +
            "Type DELETE to confirm:"
        );

        if (confirmation !== "DELETE")
        {
            return;
        }

        clearCollectionButton.disabled = true;

        clearCollectionButton.textContent =
            "Removing...";

        let removed = 0;

        try
        {
            /* Delete manageable batches until
               this account has no entries left */

            while (true)
            {
                const { data, error } =
                    await supabaseClient
                        .from("collection_entries")
                        .select("id")
                        .eq(
                            "user_id",
                            userData.user.id
                        )
                        .order("id")
                        .limit(200);

                if (error)
                {
                    throw error;
                }

                if (data.length === 0)
                {
                    break;
                }

                const ids =
                    data.map(entry => entry.id);

                const {
                    data: deleted,
                    error: deleteError
                } =
                    await supabaseClient
                        .from("collection_entries")
                        .delete()
                        .eq(
                            "user_id",
                            userData.user.id
                        )
                        .in("id", ids)
                        .select("id");

                if (deleteError)
                {
                    throw deleteError;
                }

                if (deleted.length !== ids.length)
                {
                    throw new Error(
                        "Some entries could not be deleted."
                    );
                }

                removed += deleted.length;
            }

            /* Return to the first page */

            collectionPage = 1;

            /* Reload collection and rarity counts */

            await loadCloudCollection();

            /* Save a new snapshot with
               the empty collection's value */

            try
            {
                const { error } =
                    await supabaseClient
                        .functions.invoke(
                            "refresh-collection-prices"
                        );

                if (error)
                {
                    throw error;
                }

                await loadCollectionPricing();
            }
            catch (priceError)
            {
                console.error(priceError);

                chartMessage.textContent =
                    "Collection cleared. Refresh Prices " +
                    "to update the chart.";
            }

            alert(
                "Removed " + removed +
                " collection entries."
            );
        }
        catch (error)
        {
            console.error(error);

            /* Reload even if a batch failed */

            await loadCloudCollection();

            alert(
                "Remove All stopped after " +
                removed + " entries.\n" +
                error.message
            );
        }
        finally
        {
            clearCollectionButton.disabled = false;

            clearCollectionButton.textContent =
                "Remove All";
        }
    }
);

/* =========================================
   LOAD FULL COLLECTION FROM SUPABASE
   ========================================= */

async function loadCloudCollection()
{
    const { data: userData, error: userError } =
        await supabaseClient.auth.getUser();

    if (userError || !userData.user)
    {
        collection = [];

        collectionPrices = new Map();

        displayCollection();

        await loadCollectionPricing();

        return;
    }

    try
    {
        const allCards = [];

        const pageSize = 500;

        /* Retrieve every page of collection entries */

        for (
            let start = 0;
            ;
            start += pageSize
        )
        {
            const { data, error } =
                await supabaseClient
                    .from("collection_entries")
                    .select(
                        "id, name, quantity, scryfall_id, finish, rarity, " +
                        "color_identity, mana_value, " +
                        "set_code, set_name, collector_number, image_url"
                    )
                    .eq(
                        "user_id",
                        userData.user.id
                    )
                    .order("name")
                    .order("id")
                    .range(
                        start,
                        start + pageSize - 1
                    );

            if (error)
            {
                throw error;
            }

            allCards.push(...data);

            if (data.length < pageSize)
            {
                break;
            }
        }

        /* IMPORTANT: This is outside the loop,
           but inside the same function as allCards */

        collection = allCards;

        console.log(
            "Collection entries loaded:",
            collection.length
        );

        /* Display quantities immediately */

        displayCollection();

        /* Retrieve exact-printing prices */

        try
        {
            await loadCollectionCardPrices();

            displayCollection();
        }
        catch (error)
        {
            console.error(
                "Could not load card prices:",
                error
            );
        }

        /* Load the saved value and historical graph */

        await loadCollectionPricing();
    }
    catch (error)
    {
        console.error(
            "Could not load collection:",
            error
        );

        alert(
            "Could not load your collection. " +
            "Check the browser Console."
        );
    }
}

/* =========================================
   SAVE VERIFIED CSV PRINTINGS IN BATCHES
   ========================================= */

async function importVerifiedCardsFast(verifiedCards)
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

    /* Combine repeated printings within
       this CSV before saving */

    const grouped = new Map();

    for (const card of verifiedCards)
    {
        const key =
            card.printing.id + "|" + card.finish;

        if (grouped.has(key))
        {
            grouped.get(key).quantity +=
                card.quantity;
        }
        else
        {
            grouped.set(key, {
                printing: card.printing,
                finish: card.finish,
                quantity: card.quantity
            });
        }
    }

    const cards =
        [...grouped.values()];

    /* Find which exact printings this
       account already owns */

    const existingKeys = new Set();

    const ids = [
        ...new Set(
            cards.map(card => card.printing.id)
        )
    ];

    for (let start = 0; start < ids.length; start += 75)
    {
        const batch =
            ids.slice(start, start + 75);

        const { data, error } =
            await supabaseClient
                .from("collection_entries")
                .select("scryfall_id, finish")
                .eq("user_id", userId)
                .in("scryfall_id", batch);

        if (error)
        {
            throw error;
        }

        for (const entry of data)
        {
            existingKeys.add(
                entry.scryfall_id +
                "|" +
                entry.finish
            );
        }
    }

    const newEntries = [];
    const existingEntries = [];

    for (const card of cards)
    {
        const printing = card.printing;

        const key =
            printing.id + "|" + card.finish;

        /* Existing cards still use your
           working add-to-quantity function */

        if (existingKeys.has(key))
        {
            existingEntries.push(card);
            continue;
        }

        /* Build a full printing-specific
           collection entry */

        const rawPrice =
            card.finish === "foil"
                ? printing.prices.usd_foil
                : card.finish === "etched"
                    ? printing.prices.usd_etched
                    : printing.prices.usd;

        const imageURL =
            printing.image_uris?.normal ??
            printing.card_faces?.[0]?.image_uris?.normal ??
            null;

        newEntries.push({
            user_id: userId,

            name: printing.name,
            quantity: card.quantity,

            scryfall_id: printing.id,
            oracle_id: printing.oracle_id ?? null,

            set_code: printing.set,
            set_name: printing.set_name,
            collector_number: printing.collector_number,

            finish: card.finish,
            rarity: printing.rarity,

            color_identity: printing.color_identity,
            mana_value: printing.cmc,
            type_line: printing.type_line,

            image_url: imageURL,

            price_usd:
                rawPrice === null ||
                rawPrice === undefined
                    ? null
                    : Number(rawPrice)
        });
    }

    /* Insert new printings together
       in manageable database batches */

    for (
        let start = 0;
        start < newEntries.length;
        start += 50
    )
    {
        const batch =
            newEntries.slice(start, start + 50);

        const { error } =
            await supabaseClient
                .from("collection_entries")
                .insert(batch);

        if (error)
        {
            throw error;
        }
    }

    /* Preserve existing behavior:
       importing an owned printing adds copies */

    for (const card of existingEntries)
    {
        await addPrintingToCollection(
            card.printing,
            card.finish,
            card.quantity
        );
    }

    return {
        newPrintings: newEntries.length,
        updatedPrintings: existingEntries.length
    };
}

/* =========================================
   IMPORT PRINTING-AWARE COLLECTION
   ========================================= */

importButton.addEventListener(
    "click",
    async function()
    {
        if (collectionFile.files.length === 0)
        {
            alert(
                "Please select a CSV file first."
            );

            return;
        }

        importButton.disabled = true;

        importButton.textContent =
            "Importing...";

        try
        {
            /* Read CSV */

            const file =
                collectionFile.files[0];

            const csvText =
                await file.text();

            const importedCards =
                parseCollectionCSV(csvText);

            /* Verify all printings with Scryfall */

            const verifiedCards =
                await verifyImportedPrintings(
                    importedCards
                );

            /* Save new printings in batches */

            const importResult =
                await importVerifiedCardsFast(
                    verifiedCards
                );

            /* Reload collection */

            await loadCloudCollection();

            alert(
                "Collection import complete!\n" +
                importResult.newPrintings +
                " new printings added.\n" +
                importResult.updatedPrintings +
                " existing printings updated."
            );
        }
        catch (error)
        {
            console.error(error);

            alert(
                "Collection import failed: " +
                error.message
            );
        }
        finally
        {
            importButton.disabled = false;

            importButton.textContent =
                "Import Collection";

            collectionFile.value = "";
        }
    }
);

/* =========================================
   COMPACT CSV IMPORT BUTTON
   ========================================= */

const importCsvButton =
    document.getElementById("importCsvButton");

/* Open the file picker */

importCsvButton.addEventListener(
    "click",
    function()
    {
        if (importButton.disabled)
        {
            return;
        }

        collectionFile.click();
    }
);

/* Start importing after a file is chosen */

collectionFile.addEventListener(
    "change",
    function()
    {
        if (collectionFile.files.length > 0)
        {
            importButton.click();
        }
    }
);

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

/* =========================================
   UPDATE HEADER ACCOUNT DISPLAY
   ========================================= */

const headerAccount =
    document.getElementById("account");

supabaseClient.auth.onAuthStateChange(
    function(event, session)
    {
        const user =
            session?.user ?? null;

        headerAccount.classList.toggle(
            "is-signed-in",
            Boolean(user)
        );

        accountStatus.textContent =
            user
                ? "Signed in as " + user.email
                : "Not signed in.";
    }
);

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

            /* Update the saved collection total
            and historical chart */

            await loadCollectionPricing();

            /* Update the individual card prices */

            await loadCollectionCardPrices();

            displayCollection();

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
   CURRENT VALUE OF FILTERED COLLECTION
   ========================================= */

function displayFilteredCollectionPricing()
{
    const matchingCards =
        getFilteredCollectionCards();

    let filteredValue = 0;
    let pricedCopies = 0;
    let unpricedCopies = 0;

    for (const card of matchingCards)
    {
        const price =
            getCollectionCardPrice(card);

        if (price === null)
        {
            unpricedCopies += card.quantity;
            continue;
        }

        filteredValue +=
            price * card.quantity;

        pricedCopies += card.quantity;
    }

    filteredValue =
        Number(filteredValue.toFixed(2));

    collectionValue.textContent =
        formatCollectionMoney(filteredValue);

    chartMessage.textContent =
        "Filtered collection · " +
        matchingCards.length +
        " matching printings · " +
        pricedCopies +
        " priced copies · " +
        unpricedCopies +
        " unpriced copies. " +
        "Historical filtering is not yet available.";

    /* Remove the old unfiltered chart */

    if (priceChartInstance)
    {
        priceChartInstance.destroy();
        priceChartInstance = null;
    }

    /* Show today's filtered value only */

    priceChartInstance = new Chart(
        priceChartCanvas,
        {
            type: "line",

            data: {
                labels: ["Current"],

                datasets: [
                    {
                        label:
                            "Filtered Collection Value (USD)",

                        data: [filteredValue],

                        showLine: false,
                        pointRadius: 6,
                        pointHoverRadius: 8
                    }
                ]
            },

            options: {
                responsive: true,
                maintainAspectRatio: false,

                scales: {
                    y: {
                        ticks: {
                            callback:
                                value => "$" + value
                        }
                    }
                }
            }
        }
    );
}



/* =========================================
   DISPLAY COLLECTION PRICING
   ========================================= */

async function loadCollectionPricing()
{
    const { data: userData, error: userError } =
        await supabaseClient.auth.getUser();

    /* =========================================
       USER IS NOT SIGNED IN
       ========================================= */

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

    /* =========================================
       CHECK WHETHER FILTERS ARE ACTIVE
       ========================================= */

    const hasActiveFilters =
        collectionSearch.value.trim() !== "" ||
        collectionColorFilter.value !== "" ||
        collectionManaFilter.value !== "" ||
        collectionRarityFilter.value !== "";

    if (hasActiveFilters)
    {
        displayFilteredCollectionPricing();

        return;
    }

    /* =========================================
       NO FILTERS: LOAD FULL COLLECTION HISTORY
       ========================================= */

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
   REFRESH VALUE AFTER QUANTITY CHANGES
   ========================================= */

async function reloadCollectionAfterQuantityChange()
{
    let refreshFailed = false;

    /* Recalculate the saved collection total */

    try
    {
        const { error } =
            await supabaseClient.functions.invoke(
                "refresh-collection-prices"
            );

        if (error)
        {
            throw error;
        }
    }
    catch (error)
    {
        console.error(
            "Quantity saved, but price refresh failed:",
            error
        );

        refreshFailed = true;
    }

    /* Reload the card quantities, individual
       prices, and updated chart */

    await loadCloudCollection();

    if (refreshFailed)
    {
        chartMessage.textContent =
            "Quantity saved, but the collection " +
            "value could not refresh. " +
            "Try Refresh Prices.";
    }
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

/* =========================================
   FLOATING COLLECTION CARD PREVIEW
   ========================================= */

/* One floating preview for the whole page */

const collectionCardPreview =
    document.createElement("div");

/* Reuse the My Decks preview styling */

collectionCardPreview.className =
    "deck-card-preview";

collectionCardPreview.setAttribute(
    "aria-hidden",
    "true"
);

const collectionPreviewImage =
    document.createElement("img");

collectionPreviewImage.alt = "";

collectionCardPreview.appendChild(
    collectionPreviewImage
);

document.body.appendChild(
    collectionCardPreview
);

let activeCollectionImage = null;

let collectionPointerX = 0;
let collectionPointerY = 0;


/* Keep the preview within the window */

function positionCollectionPreview(x, y)
{
    const offset = 24;
    const margin = 12;

    const rect =
        collectionCardPreview.getBoundingClientRect();

    let left = x + offset;
    let top = y + offset;

    if (
        left + rect.width >
        window.innerWidth - margin
    )
    {
        left = x - rect.width - offset;
    }

    if (
        top + rect.height >
        window.innerHeight - margin
    )
    {
        top = y - rect.height - offset;
    }

    left = Math.max(
        margin,
        Math.min(
            left,
            window.innerWidth - rect.width - margin
        )
    );

    top = Math.max(
        margin,
        Math.min(
            top,
            window.innerHeight - rect.height - margin
        )
    );

    collectionCardPreview.style.left =
        left + "px";

    collectionCardPreview.style.top =
        top + "px";
}


/* Hide the preview */

function hideCollectionPreview()
{
    activeCollectionImage = null;

    collectionCardPreview.style.display =
        "none";
}


/* Show it when hovering over a thumbnail */

document.addEventListener(
    "pointerover",
    function(event)
    {
        if (event.pointerType === "touch")
        {
            return;
        }

        const image =
            event.target.closest?.(
                ".collection-card-thumbnail"
            );

        if (!image)
        {
            return;
        }

        activeCollectionImage = image;

        collectionPointerX =
            event.clientX;

        collectionPointerY =
            event.clientY;

        collectionPreviewImage.src =
            image.currentSrc || image.src;

        collectionCardPreview.style.display =
            "block";

        positionCollectionPreview(
            collectionPointerX,
            collectionPointerY
        );
    }
);


/* Follow the cursor */

document.addEventListener(
    "pointermove",
    function(event)
    {
        if (!activeCollectionImage)
        {
            return;
        }

        collectionPointerX =
            event.clientX;

        collectionPointerY =
            event.clientY;

        positionCollectionPreview(
            collectionPointerX,
            collectionPointerY
        );
    }
);


/* Hide when leaving the thumbnail */

document.addEventListener(
    "pointerout",
    function(event)
    {
        if (
            event.target ===
            activeCollectionImage
        )
        {
            hideCollectionPreview();
        }
    }
);


/* Correct the position after image loading */

collectionPreviewImage.addEventListener(
    "load",
    function()
    {
        if (activeCollectionImage)
        {
            positionCollectionPreview(
                collectionPointerX,
                collectionPointerY
            );
        }
    }
);


/* Prevent previews sticking during scrolling */

window.addEventListener(
    "scroll",
    hideCollectionPreview,
    true
);

window.addEventListener(
    "blur",
    hideCollectionPreview
);

/* =========================================
   FILTER COLLECTION FOR LIST AND CHART
   ========================================= */

function getFilteredCollectionCards()
{
    const searchText =
        collectionSearch.value.trim().toLowerCase();

    const selectedColor =
        collectionColorFilter.value;

    const selectedMana =
        collectionManaFilter.value;

    const selectedRarity =
        collectionRarityFilter.value;

    return collection.filter(function(card)
    {
        const nameMatches =
            card.name.toLowerCase()
                .includes(searchText);

        const colors =
            Array.isArray(card.color_identity)
                ? card.color_identity
                : null;

        /* Match the selected color identity */

        let colorMatches = false;

        if (selectedColor === "")
        {
            colorMatches = true;
        }
        else if (colors !== null)
        {
            if (selectedColor === "C")
            {
                /* Colorless only */

                colorMatches =
                    colors.length === 0;
            }
            else if (selectedColor === "mono")
            {
                /* Any card with exactly one color */

                colorMatches =
                    colors.length === 1;
            }
            else if (selectedColor.startsWith("mono:"))
            {
                /* One specific mono color */

                const monoColor =
                    selectedColor.slice(5);

                colorMatches =
                    colors.length === 1 &&
                    colors[0] === monoColor;
            }
            else
            {
                /* Existing inclusive color filtering */

                colorMatches =
                    colors.includes(selectedColor);
            }
        }

        const manaMatches =
            selectedMana === "" ||
            (
                card.mana_value !== null &&
                card.mana_value !== undefined &&
                (
                    selectedMana === "11+"
                        ? Number(card.mana_value) >= 11
                        : Number(card.mana_value) ===
                            Number(selectedMana)
                )
            );

        const rarityMatches =
            selectedRarity === "" ||
            card.rarity === selectedRarity;

        return (
            nameMatches &&
            colorMatches &&
            manaMatches &&
            rarityMatches
        );
    });
}