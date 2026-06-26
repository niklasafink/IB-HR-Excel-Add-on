/* eslint-disable no-undef */
const path = require("path");
const HtmlWebpackPlugin = require("html-webpack-plugin");
const CopyWebpackPlugin = require("copy-webpack-plugin");
const webpack = require("webpack");

const PROXY_BASE_URL = process.env.PROXY_BASE_URL || "https://localhost:3001/api";
// Basis-URL, unter der das Add-in-Bundle ausgeliefert wird (Cloudflare-Pages-Domain).
// Wird beim Prod-Build in das Manifest injiziert; Default = lokaler Dev-Server.
const ADDIN_BASE_URL = process.env.ADDIN_BASE_URL || "https://localhost:3000";

module.exports = async (env, options) => {
  const isProd = options.mode === "production";

  const config = {
    devtool: isProd ? false : "source-map",
    entry: {
      taskpane: "./src/taskpane/taskpane.ts",
      commands: "./src/commands/commands.ts",
    },
    output: {
      path: path.resolve(__dirname, "dist"),
      // Content-Hash im Prod-Build -> erlaubt dauerhaftes (immutable) Caching der JS.
      filename: isProd ? "[name].[contenthash].js" : "[name].js",
      clean: true,
    },
    resolve: {
      extensions: [".ts", ".js"],
    },
    module: {
      rules: [
        {
          test: /\.ts$/,
          exclude: /node_modules/,
          use: { loader: "ts-loader", options: { transpileOnly: true } },
        },
      ],
    },
    plugins: [
      new webpack.DefinePlugin({
        "process.env.PROXY_BASE_URL": JSON.stringify(PROXY_BASE_URL),
      }),
      new HtmlWebpackPlugin({
        filename: "taskpane.html",
        template: "./src/taskpane/taskpane.html",
        chunks: ["taskpane"],
      }),
      new HtmlWebpackPlugin({
        filename: "commands.html",
        template: "./src/commands/commands.html",
        chunks: ["commands"],
      }),
      new CopyWebpackPlugin({
        patterns: [
          { from: "assets", to: "assets" },
          { from: "src/taskpane/taskpane.css", to: "taskpane.css" },
          { from: "_headers", to: "_headers" },
          {
            from: "manifest.xml",
            to: "manifest.xml",
            transform(content) {
              // Dev-URLs durch die produktive Auslieferungs-Domain ersetzen.
              let xml = content.toString().replaceAll("https://localhost:3000", ADDIN_BASE_URL);
              // Cloudflare Pages liefert "clean URLs": ein Request auf /x.html wird per
              // 308 auf /x umgeleitet. Office lädt eine umgeleitete SourceLocation NICHT
              // (Add-in erscheint als "nicht verfügbar"). Im Remote-Build daher die
              // HTML-Seiten extensionslos referenzieren (lokal bleibt .html für den Dev-Server).
              if (!ADDIN_BASE_URL.includes("localhost")) {
                xml = xml.replaceAll("/taskpane.html", "/taskpane").replaceAll("/commands.html", "/commands");
              }
              return xml;
            },
          },
        ],
      }),
    ],
  };

  // CSS via style-loader benötigt css-loader/style-loader nur, wenn CSS importiert wird.
  // Wir laden CSS direkt im HTML, daher ist die CSS-Regel optional/harmlos.

  if (!isProd) {
    // Nur für den lokalen HTTPS-Dev-Server – im Prod-Build (z. B. auf Cloudflare) nicht nötig.
    const devCerts = require("office-addin-dev-certs");
    const httpsOptions = await devCerts.getHttpsServerOptions();
    config.devServer = {
      headers: { "Access-Control-Allow-Origin": "*" },
      server: {
        type: "https",
        options: { key: httpsOptions.key, cert: httpsOptions.cert },
      },
      port: 3000,
      static: false,
    };
  }

  return config;
};
