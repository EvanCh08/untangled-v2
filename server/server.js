require("dotenv").config();
const cors = require("cors");
const express = require("express");
const session = require("express-session");
const LokiStore = require("connect-loki")(session);
const { google } = require("googleapis");
const axios = require("axios");

const app = express();
const port = process.env.PORT || 3001;

app.use(
  session({
    secret: process.env.SESSION_SECRET, // Change this to a random secret string
    store: new LokiStore({
      path: './sessions.json', // The file path to store sessions (optional, defaults to './sessions.json')
      logErrors: true, // Whether to log errors (optional)
    }),
    resave: false,
    saveUninitialized: true,
    cookie: { secure: "auto", sameSite: 'none' },
    
  })
);

app.use(
  cors({
    origin: [process.env.CORS_ORIGIN],
    credentials: true,
    
  })
);

app.use((req, res, next) => {
  res.header(
    "Access-Control-Allow-Origin",
    "https://untangled-v2-main.onrender.com"
  );
  res.header(
    "Access-Control-Allow-Headers",
    "Origin, X-Requested-With, Content-Type, Accept"
  );
  next();
});

const clientId = process.env.GOOGLE_CLIENT_ID;
const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
const redirectUri =
  /*'https://untangled-server.render.com/oauth2callback'*/
  process.env.GOOGLE_REDIRECT_URI;

const oAuth2Client = new google.auth.OAuth2(
  clientId,
  clientSecret,
  redirectUri
);

app.get("/login", (req, res) => {
  const url = oAuth2Client.generateAuthUrl({
    access_type: "offline",
    scope: [
      "https://www.googleapis.com/auth/calendar.readonly",
      "https://www.googleapis.com/auth/userinfo.profile",
    ],
  });
  res.redirect(url);
});

app.get("/oauth2callback", async (req, res) => {
  const { code } = req.query;

  try {
    const { tokens } = await oAuth2Client.getToken(code);
    if (!tokens) {
      console.error("Failed to retrieve tokens");
      return res.status(500).send("Failed to authenticate");
    }

    console.log("Tokens retrieved:", tokens);

    oAuth2Client.setCredentials(tokens);

    // Store the tokens in the session
    req.session.tokens = tokens;
    console.log("Tokens stored in session:", req.session.tokens);

    // Save the session explicitly, if needed, then redirect
    req.session.save((err) => {
      if (err) {
        console.error("Session save error:", err);
        return res.status(500).send("Failed to save session");
      }

      console.log("Session saved successfully with tokens");
      // Redirect with auth=success query parameter
      const redirectUrl = `${process.env.REDIRECT_HOME}?auth=success`;
      res.redirect(redirectUrl);
    });
  } catch (error) {
    console.error("Error during OAuth2 callback", error);
    res.status(500).send("Authentication error");
  }
});

app.get("/user-info", async (req, res) => {
  if (!req.session.tokens || !req.session.tokens.access_token) {
    console.log("Here is tokens: ", req.session.tokens)
    console.log("Here is access token: ", req.session.tokens.access_token)
    return res.status(401).send("User not authenticated");
  }

  oAuth2Client.setCredentials(req.session.tokens);

  const peopleService = google.people({ version: "v1", auth: oAuth2Client });
  try {
    const me = await peopleService.people.get({
      resourceName: "people/me",
      personFields: "names,photos",
    });

    const userInfo = {
      name: me.data.names[0].displayName,
      photo: me.data.photos[0].url,
    };

    res.json(userInfo);
  } catch (error) {
    console.error(error);
    res.status(500).send("Error fetching user info");
  }
});

app.get("/fetch-calendar-events", async (req, res) => {
  if (!req.session.tokens || !req.session.tokens.access_token) {
    console.log("Here is tokens: ", req.session.tokens)
    console.log("Here is access token: ", req.session.tokens.access_token)
    return res.status(401).send("User not authenticated");
  }

  try {
    const response = await axios.get(
      "https://www.googleapis.com/calendar/v3/calendars/primary/events",
      {
        headers: {
          Authorization: `Bearer ${req.session.tokens.access_token}`,
        },
      }
    );
    res.json(response.data.items);
  } catch (error) {
    console.error(error);
    res.status(500).send("Error fetching calendar events");
  }
});

app.listen(port, () => {
  console.log(`Server started at http://localhost:${port}`);
});
