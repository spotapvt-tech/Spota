# Spota App - Product Features & Specifications

Spota is a modern, zen-social map discovery application designed for Gen Z. It allows explorers to drop "gems" (spots), check their "vibes", share loopable short video clips ("Video Vibes"), scratch off daily recommendations, discover nearby spots in Augmented Reality (AR), and message creators in real time.

---

## 1. Core Technology Stack

* **Frontend**: React (v19) + Vite (v8) + Vanilla CSS (Aesthetic layout with HSL colors, dark mode support, and glassmorphic designs).
* **Maps**: Leaflet + React Leaflet (Light theme tiles provided by CartoDB).
* **Backend**: Supabase (Database, Authentication, Storage buckets, and Realtime PostgreSQL replication).
* **Mobile Portability**: Capacitor (with native camera and location integrations).

---

## 2. Comprehensive Feature Walkthrough

### 🗺️ Feature 1: Interactive Zen Map
The map is the homepage of Spota. It offers a clean, visual canvas of nearby gems:
* **Interactive Marker Pins**: Spots are rendered as floating pins. Markers are color-coded and badged:
  * 💎 **Gem (Standard)**: Standard approved spot.
  * 🔥 **Trending**: Highly active spots (popularity based on reactions and share counts).
  * ⏳ **Pending**: Spots dropped by the user that are currently waiting for admin moderation.
* **Proximity Range Filter**: A slider-like chips panel (`1km`, `5km`, `10km`, `25km`, `All`) that draws a dashed visual radius around the user's coordinates on the map, dynamically filtering markers outside the boundary.
* **Text Search**: Filter spots on the map by title, description, category, or vibe tags.
* **Explore Nearby (AR) CTA**: A prominent centered button at the bottom of the screen with a pulsing radar glow that launches the AR camera finder.

### 🎥 Feature 2: Spot Detail Panels & "Video Vibes"
When a marker on the map or feed card is clicked, it opens a full-bleed Spot Details modal:
* **Switchable Media Visual**: Supports uploading a primary photo or a **15-second loopable Video Vibe**. Users can toggle between the photo view and the video player inside the modal.
* **Dynamic Share Cards**: Generates an aesthetic PNG card of the spot details (including title, category, description, and ratings) on a HTML5 Canvas, allowing users to download and share it on social media.
* **Directions integration**: Links to Google/Apple maps using the geocoded address and coordinates of the spot.
* **Reactions Bar**: Custom interactive reaction emojis (`🧘 Zen`, `🔥 Lit`, `❤️ Love`, `🌟 Gem`) that trigger real-time updates and increment spot popularity.
* **Community Tips**: A comments thread where explorers share recommendations or warnings. Spot creators can manage comments.

### 🎯 Feature 3: Vibe Profile Check
Rather than simple 5-star reviews, Spota measures locations by their distinct atmosphere:
* **Atmospheric Vectors**: Users rate five key factors on a scale of 1-5:
  * Cozy / Warm
  * Insta-Worthy
  * Lively / Buzzing
  * Zen / Quiet
  * Workspace Friendly
* **Vibe Profile Visualizer**: Displays progress bar averages for each vector on the spot modal.
* **Vibe Check Form**: Collapse-panel form allowing authenticated users to submit their ratings.

### 📱 Feature 4: AR Camera Explorer
An immersive augmented reality lens that shows spots floating in physical space:
* **Real-time Camera Overlay**: Streams the device's camera feed in the background.
* **Sensory Orienting**: Tracks the absolute orientation sensors (`deviceorientation` / `webkitCompassHeading`) to identify where the user is pointing. Supports desktop fallbacks through dragging to pan.
* **Floating AR Cards**: Shows info panels overlays corresponding to nearby spots, scaling and positioning them dynamically according to distance and direction bearing.
* **Compass HUD**: Visual display showing exact heading degrees and cardinal headings (N, NE, E, etc.).

### 💬 Feature 5: Real-Time Direct Messaging (DMs)
Direct connection between explorers and spot creators:
* **Contextual Chat Trigger**: A **Message** button next to the creator attribution in the spot detail modal. Clicking it opens a direct chat thread.
* **Inbox**: A listing page at `/chat` displaying active threads, avatars, typing previews, and message timestamps.
* **Real-Time Sync**: Subscribes to PostgreSQL database updates through Supabase channels, instantly receiving messages.
* **Optimistic UI**: Sends messages instantly to the local screen while database writes occur, displaying a temporary "Sending..." status.
* **Guest Shield**: Restricts messaging to logged-in users, displaying login call-to-actions for anonymous guests.

### 🎁 Feature 6: Daily Vibe Drop (Scratch Card)
A gamified recommendation widget:
* **Scratch Card Modal**: Accessible via the header icon. Renders a canvas mask overlay that users swipe/scratch to erase.
* **Curated Drop**: Reveals a random popular spot nearby for the day, with a link to view details.

### 📈 Feature 7: Reputation & Playlist Customization
* **Profile stats**: Shows user contribution totals:
  * **My Gems**: Listing of spots dropped by the user.
  * **Saved Gems**: Quick-access bookmarks.
  * **Reputation Points**: Calculated as `(Created Spots * 10) + (Saved Spots * 5)`.
  * **Ranks**: Ranks rise from "Explorer" to "Verified Contributor" at 50 reputation points.
* **Playlists**: Creators can make public/private playlists (e.g. "Best Study Cafes") and check/uncheck spots to add them.

---

## 3. Database Schema

### 1. `public.profiles`
Stores user details linked to authentication:
* `id` (uuid, primary key)
* `username` (text, unique)
* `avatar_url` (text)
* `reputation` (integer, default 0)
* `is_verified` (boolean, default false)

### 2. `public.spots`
Stores geolocated pins:
* `id` (uuid, primary key)
* `title` (text)
* `category` (text)
* `description` (text)
* `latitude` (double precision)
* `longitude` (double precision)
* `image_url` (text)
* `video_url` (text)
* `address` (text)
* `status` (text, default 'pending' - approved/flagged/deleted)
* `reactions` (jsonb)
* `share_count` (integer)
* `tags` (text[])

### 3. `public.comments`
Stores spot tips:
* `id` (uuid, primary key)
* `spot_id` (uuid, references spots)
* `user_id` (uuid, references profiles, nullable)
* `guest_name` (text, for guest postings)
* `content` (text)
* `created_at` (timestamp)

### 4. `public.vibe_ratings`
Atmospheric vector submissions:
* `id` (uuid, primary key)
* `spot_id` (uuid)
* `user_id` (uuid)
* `cozy` / `insta_worthy` / `lively` / `zen` / `workspace` (integer check 1-5)

### 5. `public.playlists` & `playlist_spots`
Custom user folders:
* `id`, `name`, `description`, `creator_id`
* `playlist_id` + `spot_id` (composite primary key)

### 6. `public.chats` & `chat_messages`
Conversations and message threads:
* `id`, `user1_id`, `user2_id` (with user1_id < user2_id constraint)
* `chat_id`, `sender_id`, `content`, `created_at`

---

## 4. Row-Level Security (RLS) Rules

* **Spots / Comments / Ratings**:
  * Everyone can read approved spots, comments, and ratings.
  * Anyone (including guests) can insert spots or comments.
  * Only the creator can update or delete their spots/comments.
* **Playlists**:
  * Public playlists are viewable by everyone; private playlists are viewable only by their creator.
  * Only the playlist creator can insert spots into or delete spots from their playlist.
* **Chats & Messages**:
  * Users can only select or insert chats/messages if they are one of the two participants (`auth.uid() = user1_id or auth.uid() = user2_id`).
