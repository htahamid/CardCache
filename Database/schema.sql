CREATE TABLE public.collection (
    user_id UUID NOT NULL
        REFERENCES auth.users(id)
        ON DELETE CASCADE,

    name TEXT NOT NULL,

    quantity INTEGER NOT NULL
        CHECK (quantity > 0),

    PRIMARY KEY (user_id, name)
);

-- Turn on Row Level Security

ALTER TABLE public.collection
ENABLE ROW LEVEL SECURITY;


-- Remove public access

REVOKE ALL ON public.collection
FROM anon, authenticated;


-- Give signed-in users the operations our app needs

GRANT SELECT, INSERT, UPDATE, DELETE
ON public.collection
TO authenticated;


-- Users can read only their own collection

CREATE POLICY "Users can view their own cards"
ON public.collection
FOR SELECT
TO authenticated
USING (
    (SELECT auth.uid()) = user_id
);


-- Users can insert only their own cards

CREATE POLICY "Users can add their own cards"
ON public.collection
FOR INSERT
TO authenticated
WITH CHECK (
    (SELECT auth.uid()) = user_id
);


-- Users can update only their own cards

CREATE POLICY "Users can update their own cards"
ON public.collection
FOR UPDATE
TO authenticated
USING (
    (SELECT auth.uid()) = user_id
)
WITH CHECK (
    (SELECT auth.uid()) = user_id
);


-- Users can delete only their own cards

CREATE POLICY "Users can delete their own cards"
ON public.collection
FOR DELETE
TO authenticated
USING (
    (SELECT auth.uid()) = user_id
);