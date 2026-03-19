# Gossip

Campaign-based bulk messaging system in Node.js using Express and the WhatsApp Cloud API.

## Features

- Upload a CSV file with `phone,param1,param2` rows for template campaigns
- Create an in-memory campaign with live stats
- Queue and process messages sequentially
- Wait 2 seconds between message attempts
- Retry failed sends up to 2 times
- Normalize phone numbers by removing `+` and non-digits
- Log every message result to `logs/campaign.log`
- Expose a reusable WhatsApp sender for template and internal text messages
- Include a React operator UI for test sends, campaign launches, and live campaign checks

## Project Structure

```text
. 
|-- logs
|-- uploads
|-- frontend
|-- src
|   |-- controllers
|   |   |-- campaignController.js
|   |   `-- sendTestController.js
|   |-- middleware
|   |   `-- upload.js
|   |-- routes
|   |   |-- campaign.js
|   |   `-- sendTest.js
|   |-- services
|   |   |-- campaignService.js
|   |   |-- logService.js
|   |   |-- messageService.js
|   |   |-- queueService.js
|   |   `-- whatsappService.js
|   |-- utils
|   |   |-- csv.parser.js
|   |   |-- phone.js
|   |   `-- time.js
|   |-- app.js
|   `-- server.js
|-- .env.example
|-- .gitignore
|-- package.json
`-- README.md
```

## Setup

1. Install dependencies:

   ```bash
   npm install
   ```

2. Create your environment file:

   ```bash
   cp .env.example .env
   ```

3. Fill in your WhatsApp Cloud API credentials in `.env`.

4. Start the backend in development mode:

   ```bash
   npm run dev
   ```

5. Start the React UI:

   From the repo root:

   ```bash
   npm run client:dev
   ```

   Or from the frontend folder:

   ```bash
   cd frontend
   npm install
   npm run dev
   ```

6. Start in production mode:

   ```bash
   npm start
   ```

7. Build the UI for production:

   From the repo root:

   ```bash
   npm run client:build
   ```

   This outputs static assets to `frontend/dist`, and the Express app will serve them automatically when present.

## UI

The UI is designed for non-technical operators and includes:

- `Send test message`: validate a template with dynamic parameter fields before bulk sending
- `Start campaign`: upload a CSV, choose the template, and launch a campaign in one flow
- `Monitor campaign`: paste a campaign ID or jump directly from campaign creation to a live status view

Frontend development URL:

- `http://localhost:5173`

## Frontend Deployment On Vercel

The frontend is configured to call the Railway backend directly:

- `https://gossip-production-5ef5.up.railway.app`

Deploy the `frontend/` app on Vercel with the standard Vite settings:

1. Set the project root to `frontend`
2. Build command: `npm run build`
3. Output directory: `dist`

No frontend rebuild-time environment variable is required for the backend URL because it is defined in [frontend/src/config.js](/Users/shubham.shukla/Documents/gossip/frontend/src/config.js).

## Environment Variables

- `PORT`: Port used by the server. Default is `3000`.
- `WHATSAPP_ACCESS_TOKEN`: Meta WhatsApp Cloud API access token.
- `PHONE_NUMBER_ID`: Phone number ID from your Meta app.
- `CORS_ALLOWED_ORIGINS`: Comma-separated list of allowed browser origins. Leave empty to allow all origins.

## CSV Format

Each row must contain `phone,param1,param2`. A header row of `phone,param1,param2` is also accepted.

```csv
phone,param1,param2
14155550100,Alice,1234
+919876543210,Bob,5678
```

Phone numbers are normalized to digits only. Invalid phone numbers are marked as failed immediately.

## API

### `POST /campaign`

Upload a CSV file and start a campaign.

Request:

- `Content-Type: multipart/form-data`
- File field name: `file`
- Text field: `templateName`
- Optional text field: `languageCode` defaulting to `en_US`

Example:

```bash
curl -X POST http://localhost:3000/campaign \
  -F "file=@contacts.csv" \
  -F "templateName=order_update" \
  -F "languageCode=en_US"
```

Sample response:

```json
{
  "campaignId": "9e9eb8f7-43c8-4719-8a8d-beb182c71017",
  "status": "started"
}
```

### `GET /campaign/:id`

Fetch the current campaign status.

Example:

```bash
curl http://localhost:3000/campaign/9e9eb8f7-43c8-4719-8a8d-beb182c71017
```

Sample response:

```json
{
  "success": true,
  "data": {
    "total": 10,
    "success": 7,
    "failed": 2,
    "status": "processing"
  }
}
```

### `POST /send-test`

Send a WhatsApp template message using the reusable core service.

Request body:

```json
{
  "to": "14155550100",
  "type": "template",
  "templateName": "hello_world",
  "languageCode": "en_US",
  "components": []
}
```

Example:

```bash
curl -X POST http://localhost:3000/send-test \
  -H "Content-Type: application/json" \
  -d '{
    "to":"14155550100",
    "type":"template",
    "templateName":"hello_world",
    "languageCode":"en_US",
    "components":[]
  }'
```

Sample response:

```json
{
  "success": true,
  "data": {
    "success": true,
    "statusCode": 200,
    "data": {
      "messaging_product": "whatsapp",
      "contacts": [
        {
          "input": "14155550100",
          "wa_id": "14155550100"
        }
      ],
      "messages": [
        {
          "id": "wamid.HBg..."
        }
      ]
    }
  }
}
```

## Processing Notes

- Campaigns are stored in memory only. Restarting the app clears them.
- Template campaign messages are processed one at a time across the shared queue.
- Failed WhatsApp sends are retried up to 2 additional times.
- Uploaded CSV files are stored in `uploads/`.
- Progress is logged to the console during processing.
- Detailed logs are appended to `logs/campaign.log`.
- The core WhatsApp service logs request payloads, responses, and clear error details.
