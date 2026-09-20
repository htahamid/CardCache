/* =========================================
   SHARED LIGHT / DARK MODE
   ========================================= */

const themeToggle =
    document.getElementById("themeToggle");

const savedTheme =
    localStorage.getItem("ManaSaver-theme");

const systemPrefersLight =
    window.matchMedia(
        "(prefers-color-scheme: light)"
    ).matches;

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

    const isLight =
        theme === "light";

    const buttonLabel = isLight
        ? "Switch to dark mode"
        : "Switch to light mode";

    themeToggle.setAttribute(
        "aria-pressed",
        String(isLight)
    );

    themeToggle.setAttribute(
        "aria-label",
        buttonLabel
    );

    themeToggle.setAttribute(
        "title",
        buttonLabel
    );
}


/* Change Theme */

themeToggle.addEventListener(
    "click",
    function()
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
            "ManaSaver-theme",
            currentTheme
        );
    }
);


/* Restore Theme */

applyTheme(currentTheme);