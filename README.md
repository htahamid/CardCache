# CardCache

**Build more decks. Buy fewer cards.**

[Live Demo](https://htahamid.github.io/CardCache/index.html) | [GitHub Repository](https://github.com/htahamid/CardCache)

## About

CardCache is an inventory-aware Magic: The Gathering deckbuilding application designed to help players make better use of the cards they already own.

By combining collection management, deck analysis, and card pricing, CardCache helps players discover useful cards in their existing collections, complete unfinished Commander decks, and reduce unnecessary purchases.

## Features

### Collection Management

* Create an account and securely access your collection.
* Import an existing collection from a CSV file.
* Search Scryfall and manually add specific card printings.
* Track quantities, sets, collector numbers, finishes, and prices.
* Search and filter cards by color identity, monocolor, mana value, and rarity.
* View card images and enlarged previews.

### Deckbuilding

* Import unfinished Commander decks.
* Compare deck requirements against cards already owned.
* Identify missing cards and estimate their purchase costs.
* Discover legal cards and potential replacements from your collection.
* Explore card recommendations based on deck strategy.

### Collection Pricing

* Retrieve pricing for specific card printings and finishes.
* Calculate individual card and total collection values.
* Track overall collection value through historical snapshots.
* Filter the current collection value by color identity, mana value, rarity, and card name.

## Technologies

| Technology              | Purpose                                                              |
| ----------------------- | -------------------------------------------------------------------- |
| HTML                    | Website structure                                                    |
| CSS                     | Responsive styling and user interface                                |
| JavaScript              | Application logic, collection management, and API integration        |
| Supabase                | Authentication, cloud database, and backend services                 |
| PostgreSQL              | Storage of user collections, card information, and pricing history   |
| Supabase Edge Functions | Server-side card price refreshes and collection valuation            |
| Scryfall API            | Magic: The Gathering card information, printings, images, and prices |
| Chart.js                | Collection value charts and visualizations                           |
| GitHub Pages            | Website hosting                                                      |
| GitHub Actions          | Automated deployment                                                 |

## How It Works

1. Create an account and import your Magic: The Gathering collection.
2. Search, organize, and track the cards you own.
3. Import an unfinished Commander deck.
4. Compare the deck against your collection to identify cards you already own and cards you still need.
5. Explore potential replacements and estimate the cost of completing your deck.

## Live Demo

**[Launch CardCache](https://htahamid.github.io/CardCache/index.html)**

CardCache is hosted on GitHub Pages and uses Supabase for authentication and cloud storage.

## Hackathon Project

Built for **SASEHACK 2026**.

CardCache was developed to address a common problem among Magic: The Gathering players: purchasing cards for new decks without realizing that suitable cards may already exist in their collections.
