# Game Data Importer

A tool to import game data from various providers into a Supabase database with review, editing, and confirmation capabilities.

## Features

### 1. Game Categories
- Supports multiple categories including: 
  - New Releases
  - Trending Now
  - Most Played
  - Featured Games 
  - Exclusive Titles
  - **Banner Games** (New!)
  - More Action

### 2. Two-Step Import Process
- **First Step**: Import and review games
  - Upload game data files (JSON format)
  - See all games in a visual grid
  - Play games in embedded iframes
  - Edit any game details

- **Second Step**: Confirm and upload
  - Review final list in confirmation modal
  - Upload all games to Supabase database

### 3. Game Editing Features
- Edit any game property:
  - Title
  - Description
  - Instructions
  - Category and Main Category
  - Tags
  - Dimensions (width/height)
  - Media URLs
  - Featured status
- Remove unwanted games from the list

### 4. Dark Mode UI
- Complete dark theme styling
- High contrast for readability
- Mobile responsive design

### 5. Credential Management
- Save Supabase credentials locally
- No need to re-enter URL and API key
- Optional feature that can be toggled on/off

## How to Use

1. Select a game provider (GameMonitize or GamePix)
2. Choose a main category for the imported games
3. Select a JSON file to import
4. Enter your Supabase credentials (or they'll be pre-filled if previously saved)
5. Check "Remember credentials" to save your Supabase URL and key for next time
6. Click "Import Data" to load games for review
7. Edit any game details or remove unwanted games
8. Click "Submit All" when ready
9. Review the final list in the confirmation modal
10. Click "Confirm Upload" to save to Supabase

## Technical Details

- Built with vanilla JavaScript, HTML, and CSS
- Uses the Supabase JavaScript client for database operations
- Responsive design for all device sizes
- Dark mode UI by default

## File Formats

### GameMonitize
The application expects GameMonitize JSON files in the following format:
```json
[
  {
    "id": "12345",
    "title": "Game Title",
    "description": "Game description text",
    "instructions": "How to play the game",
    "url": "https://game-url.com",
    "category": "Action",
    "tags": "Tag1, Tag2, Tag3",
    "thumb": "https://thumbnail-url.com",
    "width": "800",
    "height": "600"
  },
  ...
]
```

### GamePix
For GamePix, the expected format is:
```json
{
  "items": [
    {
      "id": "12345",
      "title": "Game Title",
      "description": "Game description",
      "namespace": "game-slug",
      "category": "Action",
      "orientation": "landscape",
      "quality_score": 0.92,
      "width": 800,
      "height": 600,
      "date_modified": "2023-01-01T00:00:00Z",
      "date_published": "2023-01-01T00:00:00Z",
      "banner_image": "https://banner-url.com",
      "image": "https://image-url.com",
      "url": "https://game-url.com"
    },
    ...
  ]
}
```

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