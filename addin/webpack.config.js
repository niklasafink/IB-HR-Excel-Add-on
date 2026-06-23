/* eslint-disable no-undef */
const path = require("path");
const HtmlWebpackPlugin = require("html-webpack-plugin");
const CopyWebpackPlugin = require("copy-webpack-plugin");
const webpack = require("webpack");
const devCerts = require("office-addin-dev-certs");

const PROXY_BASE_URL = process.env.PROXY_BASE_URL || "https://localhost:3001/api";

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
      new HtmlWebpackPlugin({
        filename: "notify.html",
        template: "./src/notify/notify.html",
        chunks: [],
      }),
      new CopyWebpackPlugin({
        patterns: [
          { from: "assets", to: "assets" },
          { from: "src/taskpane/taskpane.css", to: "taskpane.css" },
          {
            from: "manifest.xml",
            to: "manifest.xml",
            transform(content) {
              return content;
            },
          },
        ],
      }),
    ],
  };

  // CSS via style-loader benötigt css-loader/style-loader nur, wenn CSS importiert wird.
  // Wir laden CSS direkt im HTML, daher ist die CSS-Regel optional/harmlos.

  if (!isProd) {
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
