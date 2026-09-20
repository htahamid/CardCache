
import { withSupabase } from "npm:@supabase/server@^1";

export default {
    fetch: withSupabase(
        { auth: "user" },
        async (_request, ctx) =>
        {
            const userId = ctx.userClaims?.id;

            if (!userId)
            {
                return Response.json(
                    { error: "Not signed in." },
                    { status: 401 }
                );
            }

            /* =====================================
               LOAD THIS USER'S COLLECTION
               ===================================== */

            const entries = [];

            const pageSize = 500;

            for (let start = 0; ; start += pageSize)
            {
                const { data, error } =
                    await ctx.supabase
                        .from("collection_entries")
                        .select(
                            "scryfall_id, finish, quantity"
                        )
                        .order("id")
                        .range(
                            start,
                            start + pageSize - 1
                        );

                if (error)
                {
                    throw error;
                }

                entries.push(...data);

                if (data.length < pageSize)
                {
                    break;
                }
            }

            /* Unique physical printings */

            const printingIds = [
                ...new Set(
                    entries
                        .map(card => card.scryfall_id)
                        .filter(Boolean)
                )
            ];

            const prices = new Map();

            const now = new Date();

            const oneDayAgo =
                now.getTime() -
                24 * 60 * 60 * 1000;

            /* =====================================
               LOAD CACHED PRICES
               ===================================== */

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
                    await ctx.supabase
                        .from("card_prices")
                        .select(
                            "scryfall_id, finish, price_usd, updated_at"
                        )
                        .in("scryfall_id", batch);

                if (error)
                {
                    throw error;
                }

                for (const price of data)
                {
                    prices.set(
                        price.scryfall_id +
                        "|" +
                        price.finish,
                        price
                    );
                }
            }

            /* Refresh only stale printings */

            const finishes = [
                "nonfoil",
                "foil",
                "etched"
            ];

            const staleIds =
                printingIds.filter(function(id)
                {
                    return finishes.some(
                        function(finish)
                        {
                            const cached =
                                prices.get(
                                    id + "|" + finish
                                );

                            return !cached ||
                                new Date(
                                    cached.updated_at
                                ).getTime() < oneDayAgo;
                        }
                    );
                });

            /* =====================================
               FETCH SCRYFALL IN BATCHES
               ===================================== */

            for (
                let start = 0;
                start < staleIds.length;
                start += 75
            )
            {
                const batch =
                    staleIds.slice(
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
                                "application/json",

                            "User-Agent":
                                "CardCache/0.1"
                        },

                        body: JSON.stringify({
                            identifiers:
                                batch.map(
                                    id => ({ id })
                                )
                        })
                    }
                );

                if (!response.ok)
                {
                    throw new Error(
                        "Scryfall request failed: " +
                        response.status
                    );
                }

                const result =
                    await response.json();

                const rows = [];

                const refreshedAt =
                    new Date().toISOString();

                for (const card of result.data)
                {
                    const values = {
                        nonfoil:
                            card.prices.usd,

                        foil:
                            card.prices.usd_foil,

                        etched:
                            card.prices.usd_etched
                    };

                    for (const finish of finishes)
                    {
                        const raw =
                            values[finish];

                        const row = {
                            scryfall_id: card.id,

                            finish: finish,

                            price_usd:
                                raw === null
                                    ? null
                                    : Number(raw),

                            updated_at:
                                refreshedAt
                        };

                        rows.push(row);

                        prices.set(
                            card.id + "|" + finish,
                            row
                        );
                    }
                }

                if (rows.length > 0)
                {
                    const { error } =
                        await ctx.supabaseAdmin
                            .from("card_prices")
                            .upsert(
                                rows,
                                {
                                    onConflict:
                                        "scryfall_id,finish"
                                }
                            );

                    if (error)
                    {
                        throw error;
                    }
                }

                /* Avoid rapid API requests */

                if (start + 75 < staleIds.length)
                {
                    await new Promise(
                        resolve =>
                            setTimeout(
                                resolve,
                                650
                            )
                    );
                }
            }

            /* =====================================
               CALCULATE COLLECTION VALUE
               ===================================== */

            let totalValue = 0;

            let pricedCopies = 0;

            let unpricedCopies = 0;

            for (const entry of entries)
            {
                const key =
                    entry.scryfall_id +
                    "|" +
                    entry.finish;

                const price =
                    prices.get(key)?.price_usd;

                if (
                    price === null ||
                    price === undefined
                )
                {
                    unpricedCopies +=
                        entry.quantity;

                    continue;
                }

                totalValue +=
                    price * entry.quantity;

                pricedCopies +=
                    entry.quantity;
            }

            totalValue =
                Number(
                    totalValue.toFixed(2)
                );

            /* =====================================
               SAVE TODAY'S SNAPSHOT
               ===================================== */

            const snapshotDate =
                new Date()
                    .toISOString()
                    .slice(0, 10);

            const { error: saveError } =
                await ctx.supabaseAdmin
                    .from(
                        "collection_value_snapshots"
                    )
                    .upsert(
                        {
                            user_id:
                                userId,

                            snapshot_date:
                                snapshotDate,

                            total_value_usd:
                                totalValue,

                            priced_copies:
                                pricedCopies,

                            unpriced_copies:
                                unpricedCopies
                        },
                        {
                            onConflict:
                                "user_id,snapshot_date"
                        }
                    );

            if (saveError)
            {
                throw saveError;
            }

            return Response.json({
                totalValue,
                pricedCopies,
                unpricedCopies,
                snapshotDate,
                refreshedPrintings:
                    staleIds.length
            });
        }
    )
};