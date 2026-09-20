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