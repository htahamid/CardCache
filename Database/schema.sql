
-- =========================================
-- ManaSaver DATABASE SCHEMA
-- =========================================

-- =========================================
-- 1. ORIGINAL COLLECTION TABLE
-- =========================================

CREATE TABLE public.collection
(
    user_id UUID NOT NULL
        REFERENCES auth.users(id)
        ON DELETE CASCADE,

    name TEXT NOT NULL,

    quantity INTEGER NOT NULL
        CONSTRAINT collection_quantity_check
        CHECK (quantity > 0),

    CONSTRAINT collection_pkey
        PRIMARY KEY (user_id, name)
);


-- =========================================
-- 2. PRINTING-AWARE COLLECTION ENTRIES
-- =========================================

CREATE TABLE public.collection_entries
(
    id UUID NOT NULL
        DEFAULT gen_random_uuid(),

    user_id UUID NOT NULL
        REFERENCES auth.users(id)
        ON DELETE CASCADE,

    name TEXT NOT NULL,

    quantity INTEGER NOT NULL
        CONSTRAINT collection_entries_quantity_check
        CHECK (quantity > 0),

    scryfall_id UUID,

    oracle_id UUID,

    set_code TEXT,

    collector_number TEXT,

    finish TEXT,

    rarity TEXT,

    color_identity TEXT[],

    mana_value NUMERIC,

    type_line TEXT,

    image_url TEXT,

    price_usd NUMERIC,

    set_name TEXT,

    CONSTRAINT collection_entries_pkey
        PRIMARY KEY (id),

    CONSTRAINT collection_entries_finish_check
        CHECK
        (
            finish IS NULL
            OR finish IN
            (
                'nonfoil',
                'foil',
                'etched'
            )
        ),

    CONSTRAINT resolved_printing_has_finish
        CHECK
        (
            scryfall_id IS NULL
            OR finish IS NOT NULL
        )
);


-- Prevent duplicate resolved printings
-- within the same user's collection.

CREATE UNIQUE INDEX collection_printing_unique
ON public.collection_entries
(
    user_id,
    scryfall_id,
    finish
)
WHERE scryfall_id IS NOT NULL;


-- Prevent duplicate unresolved card names
-- within the same user's collection.
--
-- LOWER(name) makes this case-insensitive.

CREATE UNIQUE INDEX collection_unresolved_unique
ON public.collection_entries
(
    user_id,
    LOWER(name)
)
WHERE scryfall_id IS NULL;


-- =========================================
-- 3. CARD PRICE CACHE
-- =========================================

CREATE TABLE public.card_prices
(
    scryfall_id UUID NOT NULL,

    finish TEXT NOT NULL
        CONSTRAINT card_prices_finish_check
        CHECK
        (
            finish IN
            (
                'nonfoil',
                'foil',
                'etched'
            )
        ),

    price_usd NUMERIC
        CONSTRAINT card_prices_price_usd_check
        CHECK
        (
            price_usd IS NULL
            OR price_usd >= 0
        ),

    updated_at TIMESTAMPTZ NOT NULL
        DEFAULT NOW(),

    CONSTRAINT card_prices_pkey
        PRIMARY KEY
        (
            scryfall_id,
            finish
        )
);


-- =========================================
-- 4. COLLECTION VALUE HISTORY
-- =========================================

CREATE TABLE public.collection_value_snapshots
(
    user_id UUID NOT NULL
        REFERENCES auth.users(id)
        ON DELETE CASCADE,

    snapshot_date DATE NOT NULL,

    total_value_usd NUMERIC NOT NULL,

    priced_copies INTEGER NOT NULL,

    unpriced_copies INTEGER NOT NULL,

    created_at TIMESTAMPTZ NOT NULL
        DEFAULT NOW(),

    CONSTRAINT collection_value_snapshots_pkey
        PRIMARY KEY
        (
            user_id,
            snapshot_date
        )
);


-- =========================================
-- 5. ENABLE ROW LEVEL SECURITY
-- =========================================

ALTER TABLE public.collection
ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.collection_entries
ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.card_prices
ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.collection_value_snapshots
ENABLE ROW LEVEL SECURITY;


-- =========================================
-- 6. TABLE ACCESS PERMISSIONS
-- =========================================
--
-- These grants are based on the access
-- needed by the current application.
--
-- The read-only database queries supplied
-- do not reveal the existing table grants.
--
-- The application uses authenticated access
-- for personal collection data and prices.
--
-- Supabase's privileged backend role
-- handles server-side price updates.
-- =========================================

REVOKE ALL ON TABLE
    public.collection,
    public.collection_entries,
    public.card_prices,
    public.collection_value_snapshots
FROM PUBLIC, anon, authenticated;


-- Signed-in users can manage their
-- original collection entries.

GRANT SELECT, INSERT, UPDATE, DELETE
ON public.collection
TO authenticated;


-- Signed-in users can manage their
-- printing-aware collection entries.

GRANT SELECT, INSERT, UPDATE, DELETE
ON public.collection_entries
TO authenticated;


-- Signed-in users can read card prices.

GRANT SELECT
ON public.card_prices
TO authenticated;


-- Signed-in users can read their
-- collection value history.

GRANT SELECT
ON public.collection_value_snapshots
TO authenticated;


-- Allow Supabase's privileged backend
-- role to perform server-side operations.

GRANT SELECT, INSERT, UPDATE, DELETE
ON TABLE
    public.collection,
    public.collection_entries,
    public.card_prices,
    public.collection_value_snapshots
TO service_role;


-- =========================================
-- 7. ORIGINAL COLLECTION RLS POLICIES
-- =========================================

CREATE POLICY "Users can view their own cards"
ON public.collection
FOR SELECT
TO authenticated
USING
(
    (SELECT auth.uid()) = user_id
);


CREATE POLICY "Users can add their own cards"
ON public.collection
FOR INSERT
TO authenticated
WITH CHECK
(
    (SELECT auth.uid()) = user_id
);


CREATE POLICY "Users can update their own cards"
ON public.collection
FOR UPDATE
TO authenticated
USING
(
    (SELECT auth.uid()) = user_id
)
WITH CHECK
(
    (SELECT auth.uid()) = user_id
);


CREATE POLICY "Users can delete their own cards"
ON public.collection
FOR DELETE
TO authenticated
USING
(
    (SELECT auth.uid()) = user_id
);


-- =========================================
-- 8. COLLECTION ENTRIES RLS POLICIES
-- =========================================

CREATE POLICY "View own collection entries"
ON public.collection_entries
FOR SELECT
TO authenticated
USING
(
    (SELECT auth.uid()) = user_id
);


CREATE POLICY "Add own collection entries"
ON public.collection_entries
FOR INSERT
TO authenticated
WITH CHECK
(
    (SELECT auth.uid()) = user_id
);


CREATE POLICY "Update own collection entries"
ON public.collection_entries
FOR UPDATE
TO authenticated
USING
(
    (SELECT auth.uid()) = user_id
)
WITH CHECK
(
    (SELECT auth.uid()) = user_id
);


CREATE POLICY "Delete own collection entries"
ON public.collection_entries
FOR DELETE
TO authenticated
USING
(
    (SELECT auth.uid()) = user_id
);


-- =========================================
-- 9. CARD PRICE RLS POLICY
-- =========================================
--
-- Card prices are shared reference data.
-- Authenticated users may read them.
--
-- Price updates are performed by the
-- backend rather than regular users.
-- =========================================

CREATE POLICY "Signed-in users can read prices"
ON public.card_prices
FOR SELECT
TO authenticated
USING
(
    TRUE
);


-- =========================================
-- 10. COLLECTION HISTORY RLS POLICY
-- =========================================
--
-- Users can see only their own
-- collection valuation history.
--
-- Historical values are written
-- by the backend.
-- =========================================

CREATE POLICY "Users can read own value history"
ON public.collection_value_snapshots
FOR SELECT
TO authenticated
USING
(
    (SELECT auth.uid()) = user_id
);