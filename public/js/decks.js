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

/* One selected printing per requested deck row */

const chosenPrintings = new Map();

/* =========================================
   DECK TABLE PAGINATION
   ========================================= */

let deckPage = 1;
let deckPageSize = 25;

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

        /* Allow common section headings */

        if (/^(Commander|Deck|Mainboard)$/i.test(line))
        {
            continue;
        }

        /* Examples:
           1 Sol Ring
           1x Sol Ring
           1 Sol Ring (CMM) 396
           1 Sol Ring fic/357
        */

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

        let setCode = null;

        let collectorNumber = null;

        let finish = "nonfoil";


        /* =====================================
           CHECK FOR FINISH
           ===================================== */

        const finishMatch = name.match(
            /\s+\[(nonfoil|foil|etched)\]$/i
        );

        if (finishMatch)
        {
            finish =
                finishMatch[1].toLowerCase();

            name = name
                .slice(
                    0,
                    finishMatch.index
                )
                .trim();
        }


        /* =====================================
           CHECK FOR (SET) NUMBER
           ===================================== */

        const printingMatch = name.match(
            /\s+\(([a-z0-9]{2,8})\)\s+(\S+)$/i
        );

        if (printingMatch)
        {
            setCode =
                printingMatch[1].toLowerCase();

            collectorNumber =
                printingMatch[2];

            name = name
                .slice(
                    0,
                    printingMatch.index
                )
                .trim();
        }
        else
        {
            /* Alternative: set/number */

            const slashMatch = name.match(
                /\s+([a-z0-9]{2,8})\/(\S+)$/i
            );

            if (slashMatch)
            {
                setCode =
                    slashMatch[1].toLowerCase();

                collectorNumber =
                    slashMatch[2];

                name = name
                    .slice(
                        0,
                        slashMatch.index
                    )
                    .trim();
            }
        }


        /* =====================================
           VALIDATE CARD
           ===================================== */

        if (!Number.isSafeInteger(quantity) ||
            quantity < 1 ||
            name === "")
        {
            throw new Error(
                "Invalid card on line " +
                (i + 1)
            );
        }

        /* =====================================
        REQUIRE EXACT PRINTING
        ===================================== */

        if (!setCode || !collectorNumber)
        {
            throw new Error(
                "Line " + (i + 1) +
                " needs a set and collector number: " +
                name +
                ". Use: 1 Card Name (SET) 123"
            );
        }


        /* Keep different requested
           printings separate */

        const key =
            name.toLowerCase() +
            "|" +
            (setCode || "") +
            "|" +
            (collectorNumber || "") +
            "|" +
            finish;


        if (deckMap.has(key))
        {
            deckMap.get(key).quantity +=
                quantity;
        }
        else
        {
            deckMap.set(key, {
                name: name,

                quantity: quantity,

                set_code: setCode,

                collector_number:
                    collectorNumber,

                finish: finish
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
                .select(
                "id, name, quantity, scryfall_id, " +
                "set_code, set_name, collector_number, " +
                "finish, image_url"
                )
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
   PRICES OF OWNED PRINTINGS
   ========================================= */

function ownedPriceKey(card)
{
    return card.scryfall_id + "|" + card.finish;
}


function getOwnedPrintingPrice(card, ownedPrices)
{
    const price =
        ownedPrices.get(ownedPriceKey(card));

    return price === undefined
        ? null
        : price;
}

/* =========================================
   FORMAT AN OWNED PRINTING'S VALUE
   ========================================= */

function formatOwnedPrintingPrice(printing, ownedPrices)
{
    const price =
        getOwnedPrintingPrice(
            printing,
            ownedPrices
        );

    if (price === null)
    {
        return "Price unavailable";
    }

    return price.toLocaleString(
        "en-US",
        {
            style: "currency",
            currency: "USD"
        }
    ) + " per copy";
}

async function getOwnedPrintingPrices(ownedCards)
{
    const ownedPrices = new Map();

    const printingIds = [
        ...new Set(
            ownedCards
                .filter(card =>
                    card.scryfall_id &&
                    card.finish
                )
                .map(card => card.scryfall_id)
        )
    ];

    /* Read in batches */

    for (
        let start = 0;
        start < printingIds.length;
        start += 75
    )
    {
        const batch =
            printingIds.slice(
                start,
                start + 75
            );

        const { data, error } =
            await supabaseClient
                .from("card_prices")
                .select(
                    "scryfall_id, finish, price_usd"
                )
                .in(
                    "scryfall_id",
                    batch
                );

        if (error)
        {
            throw error;
        }

        for (const price of data)
        {
            ownedPrices.set(
                price.scryfall_id +
                "|" +
                price.finish,

                price.price_usd === null
                    ? null
                    : Number(price.price_usd)
            );
        }
    }

    /* =========================================
   FETCH OWNED PRICES MISSING FROM SUPABASE
   ========================================= */

const missingIds = [
    ...new Set(
        ownedCards
            .filter(function(card)
            {
                return (
                    card.scryfall_id &&
                    getOwnedPrintingPrice(
                        card,
                        ownedPrices
                    ) === null
                );
            })
            .map(card => card.scryfall_id)
    )
];

for (
    let start = 0;
    start < missingIds.length;
    start += 75
)
{
    const batch =
        missingIds.slice(
            start,
            start + 75
        );

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
                    batch.map(function(id)
                    {
                        return { id: id };
                    })
            })
        }
    );

    if (!response.ok)
    {
        throw new Error(
            "Could not retrieve owned printing prices: " +
            response.status
        );
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

            /* Preserve an existing valid
               saved price if there is one */

            if (
                ownedPrices.has(key) &&
                ownedPrices.get(key) !== null
            )
            {
                continue;
            }

            ownedPrices.set(
                key,

                rawPrice === null ||
                rawPrice === undefined
                    ? null
                    : Number(rawPrice)
            );
        }
    }

    /* Space out larger requests */

    if (start + 75 < missingIds.length)
    {
        await new Promise(
            resolve =>
                setTimeout(resolve, 650)
        );
    }
}

    return ownedPrices;
}

/* =========================================
   ANALYZE DECK WITHOUT DOUBLE COUNTING
   ========================================= */

function analyzeDeck(deckCards, ownedCards)
{
    const availableCards = new Map();

    /* Combine owned copies across printings */

    for (const card of ownedCards)
    {
        const key =
            card.name.trim().toLowerCase();

        const previousQuantity =
            availableCards.get(key) || 0;

        availableCards.set(
            key,
            previousQuantity + card.quantity
        );
    }

    const analysis = [];

    /* Process requested deck entries in order */

    for (const card of deckCards)
    {
        const key =
            card.name.trim().toLowerCase();

        const available =
            availableCards.get(key) || 0;

        const owned =
            Math.min(
                card.quantity,
                available
            );

        const missing =
            card.quantity - owned;

        /* These copies are now assigned
           to this requested deck entry */

        availableCards.set(
            key,
            available - owned
        );

        analysis.push({
            name: card.name,

            needed: card.quantity,

            owned: owned,

            missing: missing,

            /* Preserve requested printing
               information for price lookups */

            set_code: card.set_code,

            collector_number:
                card.collector_number,

            finish: card.finish
        });
    }

    return analysis;
}

/* =========================================
   DECK PRICE LOOKUP
   ========================================= */

/* Cache prices while this page is open */

const deckPriceCache = new Map();

/* =========================================
   IDENTIFY A REQUESTED PRINTING
   ========================================= */

function deckPriceKey(card)
{
    return (
        card.name.trim().toLowerCase() +
        "|" +
        (card.set_code || "").toLowerCase() +
        "|" +
        (card.collector_number || "").toLowerCase() +
        "|" +
        (card.finish || "nonfoil")
    );
}


function getRequestedPrice(prices, card)
{
    return prices.get(
        deckPriceKey(card)
    )?.price ?? null;
}

/* =========================================
   LOOK UP REQUESTED DECK PRICES
   ========================================= */

async function getDeckPrices(deckCards)
{
    const uncachedCards =
        deckCards.filter(function(card)
        {
            return !deckPriceCache.has(
                deckPriceKey(card)
            );
        });


    for (
        let start = 0;
        start < uncachedCards.length;
        start += 75
    )
    {
        const batch =
            uncachedCards.slice(
                start,
                start + 75
            );


        /* =====================================
           BUILD SCRYFALL IDENTIFIERS
           ===================================== */

        const identifiers =
            batch.map(function(card)
            {
                if (
                    card.set_code &&
                    card.collector_number
                )
                {
                    return {
                        set: card.set_code,

                        collector_number:
                            card.collector_number
                    };
                }

                /* No printing specified */

                return {
                    name: card.name
                };
            });


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
                    identifiers: identifiers
                })
            }
        );


        if (!response.ok)
        {
            throw new Error(
                "Could not retrieve deck prices: " +
                response.status
            );
        }


        const result =
            await response.json();


        /* =====================================
           MATCH EACH REQUESTED PRINTING
           ===================================== */

        for (const requested of batch)
        {
            let matchedCard = null;


            if (
                requested.set_code &&
                requested.collector_number
            )
            {
                matchedCard =
                    result.data.find(function(card)
                    {
                        return (
                            card.set.toLowerCase() ===
                                requested.set_code.toLowerCase() &&

                            card.collector_number.toLowerCase() ===
                                requested.collector_number.toLowerCase()
                        );
                    });


                /* Do not silently price a
                   different card if the user
                   entered the wrong set/number */

                if (!matchedCard)
                {
                    throw new Error(
                        "Printing not found: " +
                        requested.name +
                        " (" +
                        requested.set_code.toUpperCase() +
                        ") " +
                        requested.collector_number
                    );
                }


                if (
                    matchedCard.name.toLowerCase() !==
                    requested.name.toLowerCase()
                )
                {
                    throw new Error(
                        requested.set_code.toUpperCase() +
                        " #" +
                        requested.collector_number +
                        " is " +
                        matchedCard.name +
                        ", not " +
                        requested.name +
                        "."
                    );
                }
            }
            else
            {
                matchedCard =
                    result.data.find(function(card)
                    {
                        return (
                            card.name.toLowerCase() ===
                            requested.name.toLowerCase()
                        );
                    });
            }


            /* =====================================
               CHOOSE CORRECT FINISH PRICE
               ===================================== */

            let price = null;

            let printingLabel =
                "Printing not specified";


            if (matchedCard)
            {
                const finish =
                    requested.finish || "nonfoil";


                let rawPrice = null;


                if (finish === "nonfoil")
                {
                    rawPrice =
                        matchedCard.prices.usd;
                }
                else if (finish === "foil")
                {
                    rawPrice =
                        matchedCard.prices.usd_foil;
                }
                else if (finish === "etched")
                {
                    rawPrice =
                        matchedCard.prices.usd_etched;
                }


                if (
                    rawPrice !== null &&
                    rawPrice !== undefined
                )
                {
                    price =
                        Number(rawPrice);
                }


                printingLabel =
                    matchedCard.set_name +
                    " · #" +
                    matchedCard.collector_number +
                    " · " +
                    finish;
            }


            deckPriceCache.set(
                deckPriceKey(requested),
                {
                    price: price,

                    printing: printingLabel,

                    image_url:
                        matchedCard?.image_uris?.normal ??
                        matchedCard?.card_faces?.[0]
                            ?.image_uris?.normal ??
                        null
                }
            );
        }


        /* Space out multiple batches */

        if (start + 75 < uncachedCards.length)
        {
            await new Promise(
                resolve =>
                    setTimeout(resolve, 650)
            );
        }
    }


    return deckPriceCache;
}

/* =========================================
   STARTER CARD SUBSTITUTIONS
   ========================================= */

const cardAlternatives = new Map([
    [
        "mana drain",
        [
            {
                name: "Counterspell",
                reason:
                    "Both counter a spell. " +
                    "Mana Drain also provides mana."
            },
            {
                name: "Arcane Denial",
                reason:
                    "Both counter a spell, but " +
                    "Arcane Denial allows card draw."
            }
        ]
    ],

    [
        "kodama's reach",
        [
            {
                name: "Cultivate",
                reason:
                    "Similar basic-land ramp effect."
            }
        ]
    ],

    [
        "cultivate",
        [
            {
                name: "Kodama's Reach",
                reason:
                    "Similar basic-land ramp effect."
            }
        ]
    ],

    [
        "path to exile",
        [
            {
                name: "Swords to Plowshares",
                reason:
                    "Both exile a creature, but " +
                    "the drawback is different."
            }
        ]
    ],

    [
        "swords to plowshares",
        [
            {
                name: "Path to Exile",
                reason:
                    "Both exile a creature, but " +
                    "the drawback is different."
            }
        ]
    ]
]);

/* =========================================
   RECOMMENDATION CARD METADATA
   ========================================= */

const recommendationMetadataCache = new Map();


function cardKey(name)
{
    return name.trim().toLowerCase();
}


/* Retrieve Scryfall card information by name */

async function getRecommendationMetadata(names)
{
    const uniqueNames = [
        ...new Set(
            names.map(cardKey)
        )
    ];

    const uncachedNames =
        uniqueNames.filter(function(name)
        {
            return !recommendationMetadataCache.has(name);
        });

    for (
        let start = 0;
        start < uncachedNames.length;
        start += 75
    )
    {
        const batch =
            uncachedNames.slice(start, start + 75);

        const response = await fetch(
            "https://api.scryfall.com/cards/collection",
            {
                method: "POST",

                headers: {
                    "Content-Type": "application/json",
                    "Accept": "application/json"
                },

                body: JSON.stringify({
                    identifiers:
                        batch.map(function(name)
                        {
                            return { name: name };
                        })
                })
            }
        );

        if (!response.ok)
        {
            throw new Error(
                "Card metadata lookup failed: " +
                response.status
            );
        }

        const result = await response.json();

        /* Mark unresolved names */

        for (const name of batch)
        {
            recommendationMetadataCache.set(
                name,
                null
            );
        }

        /* Store resolved card data */

        for (const card of result.data)
        {
            recommendationMetadataCache.set(
                cardKey(card.name),
                card
            );
        }

        /* Space out requests */

        if (start + 75 < uncachedNames.length)
        {
            await new Promise(
                resolve => setTimeout(resolve, 650)
            );
        }
    }

    return recommendationMetadataCache;
}

/* =========================================
   CLASSIFY CARD ROLES
   ========================================= */

function getOracleText(card)
{
    if (card.oracle_text)
    {
        return card.oracle_text;
    }

    /* Handle cards with multiple faces */

    return (card.card_faces || [])
        .map(face => face.oracle_text || "")
        .join("\n");
}


function getCardRoles(card)
{
    if (!card)
    {
        return [];
    }

    const text = getOracleText(card);

    const type = card.type_line || "";

    const roles = [];

    /* Counterspell */

    /* Counterspell */

    if (
        /Instant/i.test(type) &&
        /counter target[^\n.]*\bspell\b/i.test(text)
    )
    {
        roles.push("counterspell");
    }

    /* Basic-land ramp */

    if (
        /search your library for[\s\S]*?basic land/i
            .test(text) &&
        /onto the battlefield/i.test(text)
    )
    {
        roles.push("land-ramp");
    }

    /* Targeted creature removal */

    if (
        /exile target creature/i.test(text) ||
        /destroy target creature/i.test(text)
    )
    {
        roles.push("creature-removal");
    }

    /* Card-draw spells */

    if (
        /Instant|Sorcery/i.test(type) &&
        /^draw (?:a|one|two|three|\d+) cards?/im
            .test(text)
    )
    {
        roles.push("card-draw");
    }

    return roles;
}

/* =========================================
   FIND ALTERNATIVES FROM OWNED CARDS
   ========================================= */

function findOwnedAlternatives(
    analysis,
    ownedCards,
    metadata,
    commander
)
{
    const available = new Map();

    /* Restrict colors only when the user
   provided a commander */

    const commanderColors =
        commander
            ? new Set(
                commander.color_identity || []
            )
            : null;

    /* Combine quantities across printings */

    for (const card of ownedCards)
    {
        const key = cardKey(card.name);

        available.set(
            key,
            (available.get(key) || 0) +
            card.quantity
        );
    }

    /* Reserve exact cards used by the deck */

    for (const card of analysis)
    {
        const key = cardKey(card.name);

        available.set(
            key,
            Math.max(
                0,
                (available.get(key) || 0) -
                card.owned
            )
        );
    }

    const suggestions = [];

    for (const requested of analysis)
    {
        if (requested.missing === 0)
        {
            continue;
        }

        const requestedKey =
            cardKey(requested.name);

        const requestedData =
            metadata.get(requestedKey);

        if (!requestedData)
        {
            continue;
        }

        const requestedRoles =
            getCardRoles(requestedData);

        if (requestedRoles.length === 0)
        {
            continue;
        }

        const candidates = [];

        /* Search every distinct card in the
           user's actual collection */

        for (const [ownedName, quantity] of available)
        {
            if (quantity <= 0)
            {
                continue;
            }

            if (ownedName === requestedKey)
            {
                continue;
            }

            const ownedData =
                metadata.get(ownedName);

            if (!ownedData)
            {
                continue;
            }

            /* Must be Commander-legal */

            if (
                ownedData.legalities?.commander !==
                "legal"
            )
            {
                continue;
            }

            /* Must fit the commander's colors */

            const ownedColors =
                ownedData.color_identity || [];

            const colorsAllowed =
                commanderColors === null ||
                ownedColors.every(
                    color => commanderColors.has(color)
                );

            if (!colorsAllowed)
            {
                continue;
            }

            const ownedRoles =
                getCardRoles(ownedData);

            const sharedRoles =
                requestedRoles.filter(
                    role => ownedRoles.includes(role)
                );

            if (sharedRoles.length === 0)
            {
                continue;
            }

            const manaDifference =
                Math.abs(
                    Number(requestedData.cmc) -
                    Number(ownedData.cmc)
                );

            /* Prefer closer mana costs and
               cards matching more roles */

            const score =
                sharedRoles.length * 10 -
                manaDifference * 2;

            candidates.push({
                name: ownedData.name,
                key: ownedName,
                sharedRoles: sharedRoles,
                score: score,
                manaDifference: manaDifference
            });
        }

        /* Rank potential matches */

        candidates.sort(
            (a, b) => b.score - a.score
        );

        let remaining = requested.missing;

        /* =========================================
        KEEP ALL AVAILABLE ALTERNATIVES
        ========================================= */

        for (const candidate of candidates)
        {
            const availableQuantity =
                available.get(candidate.key) || 0;

            if (availableQuantity <= 0)
            {
                continue;
            }

            /* One option cannot cover more copies
            than the deck is missing */

            const quantity =
                Math.min(
                    requested.missing,
                    availableQuantity
                );

            suggestions.push({
                requested: requested.name,

                alternative: candidate.name,

                quantity: quantity,

                reason:
                    "Shared role: " +
                    candidate.sharedRoles.join(", ") +
                    ". Mana value difference: " +
                    candidate.manaDifference +
                    ". Review the card text " +
                    "before substituting."
            });
        }
    }

    return suggestions;
}

/* =========================================
   CALCULATE OPTIMIZED DECK VALUE
   ========================================= */

function calculateOptimizedDeck(
    analysis,
    ownedCards,
    suggestions,
    requestedPrices,
    ownedPrices
)
{
    let originalValue = 0;

    let optimizedValue = 0;

    let unpricedRequested = 0;

    let unpricedOwned = 0;

    const substitutions = [];

    /* Copies of each collection entry
       that have not been assigned yet */

    const remaining = new Map();

    for (const entry of ownedCards)
    {
        remaining.set(
            entry.id,
            entry.quantity
        );
    }


    /* Find available printings of a name,
       cheapest known prices first */

    function availablePrintings(name)
    {
        return ownedCards
            .filter(function(entry)
            {
                return (
                    cardKey(entry.name) ===
                        cardKey(name) &&

                    (remaining.get(entry.id) || 0) > 0
                );
            })
            .sort(function(a, b)
            {
                const aPrice =
                    getOwnedPrintingPrice(
                        a,
                        ownedPrices
                    ) ?? Infinity;

                const bPrice =
                    getOwnedPrintingPrice(
                        b,
                        ownedPrices
                    ) ?? Infinity;

                return aPrice - bPrice;
            });
    }


    /* =====================================
       RESERVE EXACT OWNED CARDS FIRST
       ===================================== */

    for (const card of analysis)
    {
        const requestedPrice =
            getRequestedPrice(
                requestedPrices,
                card
            );

        if (requestedPrice === null)
        {
            unpricedRequested +=
                card.needed;
        }
        else
        {
            originalValue +=
                requestedPrice * card.needed;
        }

        let neededFromCollection =
            card.owned;

        for (
            const entry of
            availablePrintings(card.name)
        )
        {
            if (neededFromCollection === 0)
            {
                break;
            }

            const quantity =
                Math.min(
                    neededFromCollection,
                    remaining.get(entry.id)
                );

            remaining.set(
                entry.id,
                remaining.get(entry.id) -
                    quantity
            );

            neededFromCollection -= quantity;

            /* We cannot compare a card
               whose requested price is unknown */

            if (requestedPrice === null)
            {
                continue;
            }

            const ownedPrice =
                getOwnedPrintingPrice(
                    entry,
                    ownedPrices
                );

            if (ownedPrice === null)
            {
                /* Use the requested price as
                   a placeholder, NOT as a
                   claimed owned market price */

                optimizedValue +=
                    requestedPrice * quantity;

                unpricedOwned += quantity;
            }
            else
            {
                optimizedValue +=
                    ownedPrice * quantity;
            }
        }
    }


    /* =====================================
       FIND LOWER-PRICED OWNED ALTERNATIVES
       ===================================== */

    for (const card of analysis)
    {
        const requestedPrice =
            getRequestedPrice(
                requestedPrices,
                card
            );

        if (requestedPrice === null)
        {
            continue;
        }

        let stillMissing =
            card.missing;

        /* Names suggested for THIS
           requested card */

        const alternativeNames =
            new Set(
                suggestions
                    .filter(function(suggestion)
                    {
                        return cardKey(
                            suggestion.requested
                        ) === cardKey(card.name);
                    })
                    .map(function(suggestion)
                    {
                        return cardKey(
                            suggestion.alternative
                        );
                    })
            );


        /* Find their remaining, priced copies */

        const options =
            ownedCards
                .filter(function(entry)
                {
                    const ownedPrice =
                        getOwnedPrintingPrice(
                            entry,
                            ownedPrices
                        );

                    return (
                        alternativeNames.has(
                            cardKey(entry.name)
                        ) &&

                        (remaining.get(entry.id) || 0) > 0 &&

                        ownedPrice !== null &&

                        ownedPrice < requestedPrice
                    );
                })
                .sort(function(a, b)
                {
                    return (
                        getOwnedPrintingPrice(
                            a,
                            ownedPrices
                        ) -

                        getOwnedPrintingPrice(
                            b,
                            ownedPrices
                        )
                    );
                });


        for (const entry of options)
        {
            if (stillMissing === 0)
            {
                break;
            }

            const quantity =
                Math.min(
                    stillMissing,
                    remaining.get(entry.id)
                );

            if (quantity <= 0)
            {
                continue;
            }

            const ownedPrice =
                getOwnedPrintingPrice(
                    entry,
                    ownedPrices
                );

            optimizedValue +=
                ownedPrice * quantity;

            remaining.set(
                entry.id,
                remaining.get(entry.id) -
                    quantity
            );

            stillMissing -= quantity;

            substitutions.push({
                requested: card.name,

                requestedKey: deckPriceKey(card),

                alternative: entry.name,
                
                image_url: entry.image_url || null,

                set_name:
                    entry.set_name ||
                    entry.set_code?.toUpperCase() ||
                    "Unknown printing",

                collector_number:
                    entry.collector_number,

                finish: entry.finish,

                quantity: quantity,

                originalPrice: requestedPrice,

                replacementPrice: ownedPrice
            });
        }


        /* Missing slots without a selected
           cheaper owned alternative retain
           their requested-card value */

        optimizedValue +=
            requestedPrice * stillMissing;
    }


    return {
        originalValue: originalValue,

        optimizedValue: optimizedValue,

        valueDifference:
            originalValue - optimizedValue,

        unpricedRequested:
            unpricedRequested,

        unpricedOwned:
            unpricedOwned,

        substitutions:
            substitutions
    };
}

/* =========================================
   DISPLAY DECK VALUE COMPARISON
   ========================================= */

function displayDeckSavings(
    analysis,
    prices,
    suggestions,
    ownedCards,
    ownedPrices
)
{
    const estimate =
        calculateOptimizedDeck(
            analysis,
            ownedCards,
            suggestions,
            prices,
            ownedPrices
        );


    function money(value)
    {
        return value.toLocaleString(
            "en-US",
            {
                style: "currency",
                currency: "USD"
            }
        );
    }


    const summary =
        document.createElement("section");

    summary.className =
        "deck-savings-summary";


    const heading =
        document.createElement("h3");

    heading.textContent =
        "Estimated Deck Value Comparison";

    summary.appendChild(heading);


    /* =====================================
       OWNED CARD COUNT
       ===================================== */

    let totalNeeded = 0;

    let totalOwned = 0;

    for (const card of analysis)
    {
        totalNeeded += card.needed;

        totalOwned += card.owned;
    }


    /* =====================================
       FOUR DASHBOARD BOXES
       ===================================== */

    const totals = [
        [
            "Original deck value",
            estimate.originalValue,
            "deck-saving-card--original"
        ],
        [
            "Optimized deck value",
            estimate.optimizedValue,
            "deck-saving-card--remaining"
        ],
        [
            "Estimated value difference",
            estimate.valueDifference,
            "deck-saving-card--saved"
        ],
        [
            "Cards already owned",
            totalOwned + " / " + totalNeeded,
            "deck-saving-card--owned"
        ]
    ];


    const totalsGrid =
        document.createElement("div");

    totalsGrid.className =
        "deck-savings-grid";


    for (const [label, value, className] of totals)
    {
        const card =
            document.createElement("div");

        card.className =
            "deck-saving-card " + className;


        const labelElement =
            document.createElement("span");

        labelElement.className =
            "deck-saving-label";

        labelElement.textContent =
            label;

        card.appendChild(labelElement);


        const amount =
            document.createElement("strong");

        amount.className =
            "deck-saving-amount";

        amount.textContent =
            className === "deck-saving-card--owned"
                ? value
                : money(value);

        card.appendChild(amount);


        if (
            className ===
            "deck-saving-card--original"
        )
        {
            const note =
                document.createElement("small");

            note.className =
                "deck-pricing-note";

            note.textContent =
                "Estimated using Scryfall USD prices. " +
                "Actual purchase prices may vary.";

            card.appendChild(note);
        }


        totalsGrid.appendChild(card);
    }


    summary.appendChild(totalsGrid);


    /* =====================================
       SHOW MODELED SUBSTITUTIONS
       ===================================== */

    if (estimate.substitutions.length > 0)
    {
        const swapsHeading =
            document.createElement("h4");

        swapsHeading.textContent =
            "Lower-value owned substitutions " +
            "used in this estimate";

        summary.appendChild(swapsHeading);


        const swapList =
            document.createElement("ul");

        for (
            const swap of
            estimate.substitutions
        )
        {
            const item =
                document.createElement("li");

            item.textContent =
                swap.requested +
                " → " +
                swap.alternative +
                " (" +
                swap.set_name +
                " #" +
                (swap.collector_number || "?") +
                ", " +
                swap.finish +
                ") × " +
                swap.quantity +
                " · " +
                money(swap.originalPrice) +
                " → " +
                money(swap.replacementPrice) +
                " per copy";

            swapList.appendChild(item);
        }

        summary.appendChild(swapList);
    }


    /* =====================================
       PRICING LIMITATIONS
       ===================================== */

    if (
        estimate.unpricedRequested > 0 ||
        estimate.unpricedOwned > 0
    )
    {
        const warning =
            document.createElement("div");

        warning.className =
            "deck-pricing-warning";


        const title =
            document.createElement("strong");

        title.textContent =
            "Incomplete pricing information";

        warning.appendChild(title);


        const details =
            document.createElement("p");

        details.textContent =
            estimate.unpricedRequested +
            " requested copies lack a Scryfall " +
            "reference price. " +
            estimate.unpricedOwned +
            " assigned owned copies lack a " +
            "known printing price. " +
            "Totals are partial estimates; " +
            "unpriced owned copies use the " +
            "requested price as a placeholder.";

        warning.appendChild(details);

        summary.appendChild(warning);
    }


    const explanation =
        document.createElement("p");

    explanation.className =
        "deck-small-note";

    explanation.textContent =
        "Value difference compares estimated " +
        "card market values, not cash received " +
        "or the amount still needed to buy cards. " +
        "Suggested substitutions are not yet " +
        "applied to your decklist.";

    summary.appendChild(explanation);


    deckResults.prepend(summary);
}

/* =========================================
   DISPLAY DECK ANALYSIS
   ========================================= */

function displayDeckAnalysis(analysis,
                            ownedCards,
                            suggestions,
                            prices,
                            optimizedSubstitutions,
                            ownedPrices)
{
    deckResults.replaceChildren();

    let totalNeeded = 0;
    let totalOwned = 0;
    let totalMissing = 0;

/* =========================================
   PAGINATE THE DISPLAYED DECK ROWS
   ========================================= */

const pageCount = Math.max(
    1,
    Math.ceil(
        analysis.length / deckPageSize
    )
);

deckPage = Math.min(
    Math.max(deckPage, 1),
    pageCount
);

const startIndex =
    (deckPage - 1) * deckPageSize;

const pageCards =
    analysis.slice(
        startIndex,
        startIndex + deckPageSize
    );

/* Each visible card */

for (const card of pageCards)

    /* Clear the loading message now that
    the analysis is displayed */

    deckStatus.textContent = "";

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

        /* =========================================
        CARD NAME AND OWNED PRINTINGS
        ========================================= */

        const nameCell =
            document.createElement("td");

        const cardName =
            document.createElement("strong");

        cardName.textContent = card.name;

        nameCell.appendChild(cardName);

        /* =========================================
        SHOW THE OPTIMIZER'S PROPOSED PRINTING
        ========================================= */

        const selectedSwaps =
            optimizedSubstitutions.filter(
                function(swap)
                {
                    return (
                        swap.requestedKey ===
                        deckPriceKey(card)
                    );
                }
            );

        if (selectedSwaps.length > 0)
        {
            const preview =
                document.createElement("div");

            preview.className =
                "deck-optimized-preview";

            const previewHeading =
                document.createElement("strong");

            previewHeading.className =
                "deck-optimized-heading";

            previewHeading.textContent =
                "Proposed optimized replacement";

            preview.appendChild(previewHeading);

            for (const swap of selectedSwaps)
            {
                const option =
                    document.createElement("div");

                option.className =
                    "deck-optimized-option";

                /* Actual image saved for
                the owned printing */

                if (swap.image_url)
                {
                    const image =
                        document.createElement("img");

                    image.src =
                        swap.image_url;

                    image.alt =
                        swap.alternative;

                    image.loading =
                        "lazy";

                    image.className =
                        "deck-optimized-image";

                    option.appendChild(image);
                }

                const information =
                    document.createElement("div");

                information.className =
                    "deck-optimized-information";

                const name =
                    document.createElement("strong");

                name.textContent =
                    swap.alternative +
                    " × " +
                    swap.quantity;

                information.appendChild(name);

                const printing =
                    document.createElement("p");

                printing.textContent =
                    swap.set_name +
                    " · #" +
                    (swap.collector_number || "?") +
                    " · " +
                    swap.finish;

                information.appendChild(printing);

                const price =
                    document.createElement("p");

                price.textContent =
                    "Owned printing value: " +
                    swap.replacementPrice.toLocaleString(
                        "en-US",
                        {
                            style: "currency",
                            currency: "USD"
                        }
                    ) +
                    " per copy";

                information.appendChild(price);

                const difference =
                    document.createElement("p");

                difference.className =
                    "deck-optimized-difference";

                const amount =
                    (
                        swap.originalPrice -
                        swap.replacementPrice
                    ) * swap.quantity;

                difference.textContent =
                    "Estimated deck value reduction: " +
                    amount.toLocaleString(
                        "en-US",
                        {
                            style: "currency",
                            currency: "USD"
                        }
                    );

                information.appendChild(difference);

                option.appendChild(information);

                preview.appendChild(option);
            }

            nameCell.appendChild(preview);
        }

        /* =========================================
   REQUESTED PRINTING AND PRICE
   ========================================= */

const priceInfo =
    prices.get(
        deckPriceKey(card)
    );

const requestedPrinting =
    document.createElement("div");

requestedPrinting.className =
    "deck-requested-printing";


if (priceInfo)
{
    const priceText =
        priceInfo.price === null
            ? "Price unavailable"
            : priceInfo.price.toLocaleString(
                "en-US",
                {
                    style: "currency",
                    currency: "USD"
                }
            );

    requestedPrinting.textContent =
        priceInfo.printing +
        " · " +
        priceText +
        " per copy";
}
else
{
    requestedPrinting.textContent =
        "Price unavailable";
}


/* Display the original requested artwork */

if (priceInfo?.image_url)
{
    const originalImage =
        document.createElement("img");

    originalImage.src =
        priceInfo.image_url;

    originalImage.alt =
        card.name + " requested printing";

    originalImage.loading = "lazy";

    originalImage.className =
        "deck-requested-image";

    requestedPrinting.prepend(
        originalImage
    );
}

/* Put the original directly after
   the card name, before replacements */

nameCell.insertBefore(
    requestedPrinting,
    nameCell.children[1] || null
);

/* =========================================
   SELECT AN EXACT OWNED PRINTING
   ========================================= */

const requestedKey =
    deckPriceKey(card);

const choiceMessage =
    document.createElement("p");

choiceMessage.className =
    "deck-printing-choice-message";

nameCell.appendChild(choiceMessage);

const printingChoiceButtons = [];


/* Refresh all buttons belonging
   to this requested deck row */

function refreshPrintingChoices()
{
    const chosen =
        chosenPrintings.get(requestedKey);

    for (const entry of printingChoiceButtons)
    {
        const isSelected =
            chosen?.entryId === entry.printing.id;

        entry.button.textContent =
            isSelected
                ? "✓ Selected — click to undo"
                : "Choose this printing";

        entry.button.classList.toggle(
            "selected",
            isSelected
        );
    }

    if (!chosen)
    {
        choiceMessage.textContent = "";

        return;
    }

    choiceMessage.textContent =
        "Your choice: " +
        chosen.name +
        " · " +
        chosen.setName +
        " · #" +
        (chosen.collectorNumber || "?") +
        " · " +
        chosen.finish;
}


/* Add a working choice button
   to a particular printing */

function addPrintingChoiceButton(printing, parent)
{
    const button =
        document.createElement("button");

    button.type = "button";

    button.className =
        "deck-choose-printing-button";

    button.textContent =
        "Choose this printing";

    button.addEventListener(
        "click",
        function()
        {
            const current =
                chosenPrintings.get(requestedKey);

            /* Click again to undo */

            if (current?.entryId === printing.id)
            {
                chosenPrintings.delete(
                    requestedKey
                );

                refreshPrintingChoices();

                return;
            }

            /* Do not select more copies of
               this printing than are owned */

            const selectedElsewhere =
                [...chosenPrintings.entries()]
                    .filter(function([key, choice])
                    {
                        return (
                            key !== requestedKey &&
                            choice.entryId === printing.id
                        );
                    })
                    .length;

            if (
                selectedElsewhere >=
                printing.quantity
            )
            {
                choiceMessage.textContent =
                    "All copies of this printing " +
                    "are already selected for " +
                    "other deck rows.";

                return;
            }

            chosenPrintings.set(
                requestedKey,
                {
                    entryId: printing.id,

                    name: printing.name,

                    setName:
                        printing.set_name ||
                        printing.set_code?.toUpperCase() ||
                        "Unknown printing",

                    collectorNumber:
                        printing.collector_number,

                    finish:
                        printing.finish ||
                        "Unknown finish"
                }
            );

            refreshPrintingChoices();
        }
    );

    parent.appendChild(button);

    printingChoiceButtons.push({
        button: button,
        printing: printing
    });
}


        /* Find the individual printings owned */

        const ownedPrintings =
            ownedCards.filter(function(ownedCard)
            {
                return ownedCard.name.trim().toLowerCase() ===
                    card.name.trim().toLowerCase();
            });


        /* Only display printings if user owns this card */

        if (ownedPrintings.length > 0)
        {
            const printingDetails =
                document.createElement("details");

            printingDetails.className =
                "deck-owned-printings";

            const printingSummary =
                document.createElement("summary");

            printingSummary.textContent =
                "View your printings";

            printingDetails.appendChild(
                printingSummary
            );

            const printingList =
                document.createElement("ul");

            for (const printing of ownedPrintings)
            {
                const item =
                    document.createElement("li");

                if (printing.set_code)
                {
                    const setName =
                        printing.set_name ||
                        printing.set_code.toUpperCase();

                    const collectorNumber =
                        printing.collector_number || "?";

                    const finish =
                        printing.finish || "Unknown finish";

                    item.textContent =
                        setName +
                        " · #" +
                        collectorNumber +
                        " · " +
                        finish +
                        " × " +
                        printing.quantity;
                }
                else
                {
                    item.textContent =
                        "Printing not specified" +
                        " × " +
                        printing.quantity;
                }

                /* Display this exact owned
                printing's saved market price */

                item.textContent +=
                    " · Value: " +
                    formatOwnedPrintingPrice(
                        printing,
                        ownedPrices
                    );

                /* Show the image of THIS exact
                owned printing */

                if (printing.image_url)
                {
                    const image =
                        document.createElement("img");

                    image.src =
                        printing.image_url;

                    image.alt =
                        printing.name + " card";

                    image.loading =
                        "lazy";

                    image.className =
                        "deck-owned-printing-image";

                    item.prepend(image);
                }

                /* Only offer an exact-card choice
                if this row has an owned slot */

                if (card.owned > 0)
                {
                    addPrintingChoiceButton(
                        printing,
                        item
                    );
                }

                printingList.appendChild(item);
            }

            printingDetails.appendChild(
                printingList
            );

            nameCell.appendChild(
                printingDetails
            );
        }

        /* =========================================
        ALTERNATIVES FOR THIS DECK CARD
        ========================================= */

        /* Find suggestions for this particular card */

        const cardSuggestions =
            suggestions.filter(function(suggestion)
            {
                return suggestion.requested
                    .trim()
                    .toLowerCase() ===
                    card.name.trim().toLowerCase();
            });


        if (cardSuggestions.length > 0)
        {
            const alternativeDetails =
                document.createElement("details");

            alternativeDetails.className =
                "deck-owned-alternatives";


            /* Expandable button */

            const alternativeSummary =
                document.createElement("summary");

            alternativeSummary.textContent =
                "View " +
                cardSuggestions.length +
                " owned alternative" +
                (cardSuggestions.length === 1 ? "" : "s");

            alternativeDetails.appendChild(
                alternativeSummary
            );


            /* Requested card's estimated price */

            const requestedPrice =
                getRequestedPrice(
                    prices,
                    card
                );


            /* Display each recommended card */

            for (const suggestion of cardSuggestions)
            {
                const option =
                    document.createElement("div");

                option.className =
                    "deck-alternative-option";


                /* Alternative name */

                const alternativeName =
                    document.createElement("strong");

                alternativeName.textContent =
                    suggestion.alternative;

                option.appendChild(
                    alternativeName
                );


                /* Why it was recommended */

                const reason =
                    document.createElement("p");

                reason.textContent =
                    suggestion.reason;

                option.appendChild(reason);


                /* Potential savings */

                const savings =
                    document.createElement("p");

                if (
                    requestedPrice !== null &&
                    requestedPrice !== undefined
                )
                {
                    const amount =
                        requestedPrice *
                        suggestion.quantity;

                    savings.textContent =
                        "Potential purchase cost avoided: " +
                        amount.toLocaleString(
                            "en-US",
                            {
                                style: "currency",
                                currency: "USD"
                            }
                        );
                }
                else
                {
                    savings.textContent =
                        "Price unavailable";
                }

                option.appendChild(savings);


                /* =====================================
                EACH ALTERNATIVE PRINTING
                ===================================== */

                const alternativePrintings =
                    ownedCards.filter(function(ownedCard)
                    {
                        return cardKey(ownedCard.name) ===
                            cardKey(suggestion.alternative);
                    });


                const printingList =
                    document.createElement("ul");

                printingList.className =
                    "deck-alternative-printings";


                for (const printing of alternativePrintings)
                {
                    /* One box per exact printing */

                    const item =
                        document.createElement("li");

                    /* Image for THIS printing */

                    if (printing.image_url)
                    {
                        const image =
                            document.createElement("img");

                        image.src =
                            printing.image_url;

                        image.alt =
                            printing.name +
                            " (" +
                            (printing.set_code || "unknown") +
                            ") #" +
                            (printing.collector_number || "?");

                        image.loading =
                            "lazy";

                        image.className =
                            "deck-alternative-printing-image";

                        item.appendChild(image);
                    }


                    /* Text beside THIS image */

                    const information =
                        document.createElement("div");

                    information.className =
                        "deck-alternative-printing-info";


                    const printingName =
                        document.createElement("strong");

                    printingName.textContent =
                        printing.name;

                    information.appendChild(printingName);


                    const printingDetails =
                        document.createElement("p");

                    if (printing.set_code)
                    {
                        printingDetails.textContent =
                            (
                                printing.set_name ||
                                printing.set_code.toUpperCase()
                            ) +
                            " · #" +
                            (printing.collector_number || "?") +
                            " · " +
                            (printing.finish || "Unknown finish") +
                            " × " +
                            printing.quantity;
                    }
                    else
                    {
                        printingDetails.textContent =
                            "Printing not specified" +
                            " × " +
                            printing.quantity;
                    }

                    information.appendChild(printingDetails);


                    /* Exact owned printing's value */

                    const priceText =
                        document.createElement("p");

                    priceText.textContent =
                        "Value: " +
                        formatOwnedPrintingPrice(
                            printing,
                            ownedPrices
                        );

                    information.appendChild(priceText);

                    /* Choose this specific alternative
                    printing, not just its card name */

                    addPrintingChoiceButton(
                        printing,
                        information
                    );

                    /* Put this image and its information
                    together in the same printing box */

                    item.appendChild(information);

                    printingList.appendChild(item);
                }


                option.appendChild(printingList);

                /* Add this alternative and all its
                printings to the dropdown */

                alternativeDetails.appendChild(option);
            }


            nameCell.appendChild(
                alternativeDetails
            );
        }

        row.appendChild(nameCell);


        /* =========================================
        NEEDED / OWNED / MISSING COLUMNS
        ========================================= */

        const counts = [
            card.needed,
            card.owned,
            card.missing
        ];

        for (const count of counts)
        {
            const cell =
                document.createElement("td");

            cell.textContent = count;

            row.appendChild(cell);
        }
        /* Restore this row's previous
        printing choice after pagination */

        refreshPrintingChoices();

            table.appendChild(row);
            }

/* =========================================
   CHANGE THE VISIBLE DECK PAGE
   ========================================= */

function showDeckPage(nextPage)
{
    deckPage = nextPage;

    /* Preserve the financial summary
       that was added above the table */

    const summary =
        deckResults.querySelector(
            ".deck-savings-summary"
        );

    /* Redraw only the displayed deck rows */

    displayDeckAnalysis(
        analysis,
        ownedCards,
        suggestions,
        prices,
        optimizedSubstitutions,
        ownedPrices
    );

    /* Put the existing financial summary back */

    if (summary)
    {
        deckResults.prepend(summary);
    }

    /* Return to the top of the deck table */

    const topPagination =
        deckResults.querySelector(
            ".deck-pagination"
        );

    topPagination?.scrollIntoView({
        behavior: "smooth",
        block: "start"
    });
}


    /* =========================================
    CREATE PAGINATION CONTROLS
    ========================================= */

    function createDeckPagination()
    {
        const pagination =
            document.createElement("div");

        /* Reuse Collection pagination styling */

        pagination.className =
            "collection-pagination deck-pagination";


        /* Previous */

        const previousButton =
            document.createElement("button");

        previousButton.type = "button";

        previousButton.textContent =
            "← Previous";

        previousButton.disabled =
            deckPage === 1;

        previousButton.addEventListener(
            "click",
            function()
            {
                showDeckPage(deckPage - 1);
            }
        );


        /* Page selector */

        const pageLabel =
            document.createElement("label");

        pageLabel.textContent = "Page ";

        const pageSelect =
            document.createElement("select");

        for (
            let page = 1;
            page <= pageCount;
            page++
        )
        {
            const option =
                document.createElement("option");

            option.value = page;

            option.textContent = page;

            pageSelect.appendChild(option);
        }

        pageSelect.value = deckPage;

        pageSelect.addEventListener(
            "change",
            function()
            {
                showDeckPage(
                    Number(pageSelect.value)
                );
            }
        );

        pageLabel.appendChild(pageSelect);


        /* Total pages */

        const pageTotal =
            document.createElement("span");

        pageTotal.textContent =
            "of " + pageCount;


        /* Next */

        const nextButton =
            document.createElement("button");

        nextButton.type = "button";

        nextButton.textContent =
            "Next →";

        nextButton.disabled =
            deckPage === pageCount;

        nextButton.addEventListener(
            "click",
            function()
            {
                showDeckPage(deckPage + 1);
            }
        );


        /* Cards per page */

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

        sizeSelect.value =
            deckPageSize;

        sizeSelect.addEventListener(
            "change",
            function()
            {
                deckPageSize =
                    Number(sizeSelect.value);

                showDeckPage(1);
            }
        );

        sizeLabel.appendChild(sizeSelect);


        /* Assemble */

        pagination.appendChild(
            previousButton
        );

        pagination.appendChild(
            pageLabel
        );

        pagination.appendChild(
            pageTotal
        );

        pagination.appendChild(
            nextButton
        );

        pagination.appendChild(
            sizeLabel
        );

        return pagination;
    }


    /* Pagination above and below the table */

    deckResults.appendChild(
        createDeckPagination()
    );

    deckResults.appendChild(table);

    deckResults.appendChild(
        createDeckPagination()
    );
}

/* =========================================
   ANALYZE DECK BUTTON
   ========================================= */

analyzeDeckButton.addEventListener(
    "click",
    async function()
    {
        analyzeDeckButton.disabled = true;

        /* Start a fresh set of choices
        for this deck analysis */

        chosenPrintings.clear();

        deckPage = 1;

        deckResults.replaceChildren();

        deckStatus.textContent =
            "Analyzing your deck...";

        try
        {
            /* Parse the imported deck */

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

            /* Load the user's owned cards */

            const ownedCards =
                await getOwnedCards();

            /* Compare requested and owned cards */

            const analysis =
                analyzeDeck(
                    deckCards,
                    ownedCards
                );

            deckStatus.textContent =
                "Finding available alternatives...";

            /* Check for possible replacements */

            /* =====================================
            FIND DYNAMIC RECOMMENDATIONS
            ===================================== */

            let suggestions = [];

            const commanderName =
                document.getElementById("commanderName")
                    .value.trim();

            deckStatus.textContent =
                "Checking owned card alternatives...";

            /* Card roles can be checked whether
            or not a commander was entered */

            const namesToLookUp = [
                ...analysis
                    .filter(card => card.missing > 0)
                    .map(card => card.name),

                ...ownedCards.map(card => card.name)
            ];

            /* Look up the commander only if one
            was provided */

            if (commanderName !== "")
            {
                namesToLookUp.push(commanderName);
            }

            const metadata =
                await getRecommendationMetadata(
                    namesToLookUp
                );

            let commander = null;

            if (commanderName !== "")
            {
                commander =
                    metadata.get(
                        cardKey(commanderName)
                    );

                if (!commander)
                {
                    throw new Error(
                        "Commander not found on Scryfall: " +
                        commanderName
                    );
                }
            }

            suggestions =
                findOwnedAlternatives(
                    analysis,
                    ownedCards,
                    metadata,
                    commander
    );

            deckStatus.textContent =
                "Retrieving deck prices...";

            const prices =
            await getDeckPrices(
                deckCards
            );
            /* Retrieve reference prices */

            deckStatus.textContent =
                "Checking your owned printings...";

            const ownedPrices =
                await getOwnedPrintingPrices(
                    ownedCards
                );

                /* TEMPORARY DEBUG — OWNED PRINTING PRICES */

console.log(
    "Number of saved printing prices:",
    ownedPrices.size
);

console.table(
    ownedCards
        .filter(function(card)
        {
            return cardKey(card.name) ===
                "counterspell";
        })
        .map(function(card)
        {
            return {
                name: card.name,

                set: card.set_code,

                number: card.collector_number,

                scryfallId: card.scryfall_id,

                finish: card.finish,

                lookupKey: ownedPriceKey(card),

                matchedPrice:
                    getOwnedPrintingPrice(
                        card,
                        ownedPrices
                    )
            };
        })
);

/* TEMPORARY DEBUG — ACTUAL PRICE MAP */

console.table(
    [...ownedPrices.entries()].map(
        function([key, price])
        {
            return {
                key: key,
                price: price
            };
        }
    )
);

console.table(
    ownedCards
        .filter(card =>
            cardKey(card.name) === "counterspell"
        )
        .map(function(card)
        {
            const key =
                ownedPriceKey(card);

            return {
                set: card.set_code,
                number: card.collector_number,
                expectedKey: key,
                keyFound:
                    ownedPrices.has(key),
                rawPrice:
                    ownedPrices.get(key)
            };
        })
);
            
                /* Work out which owned printings
                the optimizer proposes using */

                const estimate =
                    calculateOptimizedDeck(
                        analysis,
                        ownedCards,
                        suggestions,
                        prices,
                        ownedPrices
                    );

            /* Display existing ownership table */

            displayDeckAnalysis(
                analysis,
                ownedCards,
                suggestions,
                prices,
                estimate.substitutions,
                ownedPrices
            );

            /* Add financial analysis above it */

            displayDeckSavings(
                analysis,
                prices,
                suggestions,
                ownedCards,
                ownedPrices
            );
        }
        catch (error)
        {
            console.error(error);

            deckStatus.textContent =
                "Deck analysis failed: " +
                error.message;

            deckResults.replaceChildren();
        }
        finally
        {
            analyzeDeckButton.disabled = false;
        }
    }
);

/* =========================================
   FLOATING DECK CARD PREVIEW
   ========================================= */

/* Create one preview for the entire page */

const deckCardPreview =
    document.createElement("div");

deckCardPreview.className =
    "deck-card-preview";

deckCardPreview.setAttribute(
    "aria-hidden",
    "true"
);

const deckPreviewImage =
    document.createElement("img");

deckPreviewImage.alt = "";

deckCardPreview.appendChild(
    deckPreviewImage
);

/* Add to BODY, not inside the table */

document.body.appendChild(
    deckCardPreview
);


/* Images that support the preview */

const deckPreviewSelector = [
    ".deck-requested-image",
    ".deck-optimized-image",
    ".deck-owned-printing-image",
    ".deck-alternative-printing-image"
].join(", ");


let activeDeckImage = null;

let lastPointerX = 0;
let lastPointerY = 0;


/* Position the preview beside the cursor */

function positionDeckPreview(x, y)
{
    const offset = 24;
    const margin = 12;

    const rect =
        deckCardPreview.getBoundingClientRect();

    let left = x + offset;
    let top = y + offset;

    /* Flip to the left if near
       the right edge of the screen */

    if (
        left + rect.width >
        window.innerWidth - margin
    )
    {
        left = x - rect.width - offset;
    }

    /* Flip above if near
       the bottom of the screen */

    if (
        top + rect.height >
        window.innerHeight - margin
    )
    {
        top = y - rect.height - offset;
    }

    /* Keep the preview on screen */

    left = Math.max(
        margin,
        Math.min(
            left,
            window.innerWidth -
                rect.width - margin
        )
    );

    top = Math.max(
        margin,
        Math.min(
            top,
            window.innerHeight -
                rect.height - margin
        )
    );

    deckCardPreview.style.left =
        left + "px";

    deckCardPreview.style.top =
        top + "px";
}


/* Hide the floating preview */

function hideDeckPreview()
{
    activeDeckImage = null;

    deckCardPreview.style.display =
        "none";
}


/* Show a preview when entering
   any supported card image */

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
                deckPreviewSelector
            );

        if (!image)
        {
            return;
        }

        activeDeckImage = image;

        lastPointerX =
            event.clientX;

        lastPointerY =
            event.clientY;

        deckPreviewImage.src =
            image.currentSrc || image.src;

        deckCardPreview.style.display =
            "block";

        positionDeckPreview(
            lastPointerX,
            lastPointerY
        );
    }
);


/* Follow the cursor */

document.addEventListener(
    "pointermove",
    function(event)
    {
        if (!activeDeckImage)
        {
            return;
        }

        lastPointerX =
            event.clientX;

        lastPointerY =
            event.clientY;

        positionDeckPreview(
            lastPointerX,
            lastPointerY
        );
    }
);


/* Hide when leaving the card */

document.addEventListener(
    "pointerout",
    function(event)
    {
        if (
            event.target ===
            activeDeckImage
        )
        {
            hideDeckPreview();
        }
    }
);


/* Reposition after the larger
   image finishes loading */

deckPreviewImage.addEventListener(
    "load",
    function()
    {
        if (activeDeckImage)
        {
            positionDeckPreview(
                lastPointerX,
                lastPointerY
            );
        }
    }
);


/* Avoid a preview hanging around
   during scrolling or page changes */

window.addEventListener(
    "scroll",
    hideDeckPreview,
    true
);

window.addEventListener(
    "blur",
    hideDeckPreview
);

deckResults.addEventListener(
    "click",
    hideDeckPreview
);