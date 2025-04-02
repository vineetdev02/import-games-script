# Game Data Importer

A simple web application to import game data from different providers (GameMonitize, GamePix) into a Supabase database.

## Features

- Import games from multiple providers
- Supports various data formats (GameMonitize, GamePix)
- Automatically maps provider-specific data to your Supabase schema
- Updates existing games or inserts new ones
- Displays import progress and results
- Simple and user-friendly interface

## Prerequisites

- A Supabase project with a `games` table
- The `games` table should have the following columns (at minimum):
  - `id` (int8, primary key)
  - `provider_game_id` (text)
  - `title` (text)
  - `description` (text)
  - `instructions` (text)
  - `slug` (text)
  - `category` (text)
  - `main_category` (text)
  - `tags` (text)
  - `orientation` (text)
  - `quality_score` (float4)
  - `width` (int4)
  - `height` (int4)
  - `date_modified` (timestamp)
  - `date_published` (timestamp)
  - `banner_image` (text)
  - `thumbnail_image` (text)
  - `play_url` (text)
  - `provider` (text)
  - `play_count` (int4)
  - `is_featured` (bool)
  - `is_new` (bool)
  - `created_at` (timestamp)
  - `updated_at` (timestamp)

## Setup

1. Clone this repository or download the files
2. Open `index.html` in your web browser
3. That's it! No server or build process is required

## Usage

1. Select the provider (GameMonitize or GamePix)
2. Choose the JSON file to import
3. Enter your Supabase URL and anon key
4. Click "Import Data"
5. Wait for the import to complete
6. View the results in the table below

## JSON File Format

### GameMonitize

GameMonitize JSON files should be an array of game objects with properties like:

```json
[
  {
    "id": "33591",
    "title": "WhackAMole3D",
    "description": "Game description...",
    "instructions": "Mouse click or tap to play",
    "url": "https://html5.gamemonetize.com/game-url/",
    "category": "Action",
    "tags": "1 Player, 3D, 3D Games",
    "thumb": "https://img.gamemonetize.com/image.jpg",
    "width": "800",
    "height": "600"
  },
  // More games...
]
```

### GamePix

GamePix JSON files should have an `items` array containing game objects:

```json
{
  "items": [
    {
      "id": "36DO1",
      "title": "Body Drop 3D",
      "namespace": "body-drop-3d",
      "description": "Game description...",
      "category": "action",
      "orientation": "landscape",
      "quality_score": 0.90954648,
      "width": 800,
      "height": 600,
      "date_modified": "Sun, 30 Mar 2025 00:10:33 GMT",
      "date_published": "Wed, 06 Apr 2022 14:26:01 GMT",
      "banner_image": "https://img.gamepix.com/banner.png",
      "image": "https://img.gamepix.com/image.png",
      "url": "https://play.gamepix.com/game-url"
    },
    // More games...
  ]
}
```

## How It Works

1. The importer reads the JSON file and validates its format
2. It maps the provider-specific data to your Supabase schema
3. For each game, it checks if the game already exists in the database
4. If the game exists, it updates the existing record
5. If the game doesn't exist, it inserts a new record
6. It displays the progress and results of the import process

## Support

If you encounter any issues or have questions, please open an issue in this repository. 