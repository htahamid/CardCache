/* =========================================
   DECK BUILDER
   ========================================= */

const deckInput =
    document.getElementById("deckInput");

const analyzeDeckButton =
    document.getElementById("analyzeDeckButton");

const deckStatus =
    document.getElementById("deckStatus");

const deckResults =
    document.getElementById("deckResults");

/* =========================================
   PARSE DECKLIST
   ========================================= */

function parseDecklist(deckText)
{
    const lines = deckText.split(/\r?\n/);

    const deckMap = new Map();

    for (let i = 0; i < lines.length; i++)
    {
        const line = lines[i].trim();

        if (line === "")
        {
            continue;
        }

        /* Allow common deck section headings */

        if (/^(Commander|Deck|Mainboard)$/i.test(line))
        {
            continue;
        }

        /* Example: 1 Sol Ring or 1x Sol Ring */

        const match = line.match(
            /^(\d+)\s*x?\s+(.+)$/i
        );

        if (!match)
        {
            throw new Error(
                "Invalid decklist on line " +
                (i + 1) + ": " + line
            );
        }

        const quantity = Number(match[1]);

        let name = match[2].trim();

        /* Remove optional printing details:
           Sol Ring (CMM) 396 → Sol Ring */

        name = name.replace(
            /\s+\([A-Za-z0-9]{2,8}\)\s+\S+$/,
            ""
        );

        if (!Number.isSafeInteger(quantity) ||
            quantity < 1 ||
            name === "")
        {
            throw new Error(
                "Invalid card on line " + (i + 1)
            );
        }

        const key = name.toLowerCase();

        if (deckMap.has(key))
        {
            deckMap.get(key).quantity += quantity;
        }
        else
        {
            deckMap.set(key, {
                name: name,
                quantity: quantity
            });
        }
    }

    return Array.from(deckMap.values());
}

/* =========================================
   LOAD OWNED CARDS
   ========================================= */

async function getOwnedCards()
{
    const { data: userData, error: userError } =
        await supabaseClient.auth.getUser();

    if (userError || !userData.user)
    {
        throw new Error(
            "Please sign in on the Collection page first."
        );
    }

    const userId = userData.user.id;

    const allCards = [];

    const pageSize = 500;

    let start = 0;

    while (true)
    {
        const { data, error } =
            await supabaseClient
                .from("collection_entries")
                .select("name, quantity")
                .eq("user_id", userId)
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

        start += pageSize;
    }

    return allCards;
}

/* =========================================
   ANALYZE DECK
   ========================================= */

function analyzeDeck(deckCards, ownedCards)
{
    const ownedMap = new Map();

    /* Combine all printings of the same card */

    for (const card of ownedCards)
    {
        const key =
            card.name.trim().toLowerCase();

        const previousQuantity =
            ownedMap.get(key) || 0;

        ownedMap.set(
            key,
            previousQuantity + card.quantity
        );
    }

    const analysis = [];

    for (const card of deckCards)
    {
        const key =
            card.name.trim().toLowerCase();

        const available =
            ownedMap.get(key) || 0;

        const owned =
            Math.min(card.quantity, available);

        const missing =
            Math.max(0, card.quantity - owned);

        analysis.push({
            name: card.name,
            needed: card.quantity,
            owned: owned,
            missing: missing
        });
    }

    return analysis;
}

/* =========================================
   DISPLAY DECK ANALYSIS
   ========================================= */

function displayDeckAnalysis(analysis)
{
    deckResults.replaceChildren();

    let totalNeeded = 0;
    let totalOwned = 0;
    let totalMissing = 0;

    for (const card of analysis)
    {
        totalNeeded += card.needed;
        totalOwned += card.owned;
        totalMissing += card.missing;
    }

    deckStatus.textContent =
        totalOwned + " of " +
        totalNeeded +
        " cards already owned. " +
        totalMissing +
        " still needed.";

    const table =
        document.createElement("table");

    table.className = "deck-results-table";

    /* Column headings */

    const headerRow =
        document.createElement("tr");

    const headings = [
        "Card Name",
        "Needed",
        "Owned",
        "Missing"
    ];

    for (const heading of headings)
    {
        const th =
            document.createElement("th");

        th.textContent = heading;

        headerRow.appendChild(th);
    }

    table.appendChild(headerRow);

    /* Each card */

    for (const card of analysis)
    {
        const row =
            document.createElement("tr");

        if (card.missing === 0)
        {
            row.className = "deck-card-owned";
        }
        else
        {
            row.className = "deck-card-missing";
        }

        const values = [
            card.name,
            card.needed,
            card.owned,
            card.missing
        ];

        for (const value of values)
        {
            const cell =
                document.createElement("td");

            cell.textContent = value;

            row.appendChild(cell);
        }

        table.appendChild(row);
    }

    deckResults.appendChild(table);
}

/* =========================================
   ANALYZE DECK BUTTON
   ========================================= */

analyzeDeckButton.addEventListener(
    "click",
    async function()
    {
        analyzeDeckButton.disabled = true;

        deckResults.replaceChildren();

        deckStatus.textContent =
            "Analyzing deck...";

        try
        {
            /* Read decklist */

            const deckCards =
                parseDecklist(
                    deckInput.value
                );

            if (deckCards.length === 0)
            {
                deckStatus.textContent =
                    "Please paste a decklist.";

                return;
            }

            /* Retrieve saved collection */

            const ownedCards =
                await getOwnedCards();

            /* Compare deck with collection */

            const analysis =
                analyzeDeck(
                    deckCards,
                    ownedCards
                );

            /* Show results */

            displayDeckAnalysis(
                analysis
            );
        }
        catch (error)
        {
            console.error(error);

            deckStatus.textContent =
                error.message;

            deckResults.replaceChildren();
        }
        finally
        {
            analyzeDeckButton.disabled = false;
        }
    }
);