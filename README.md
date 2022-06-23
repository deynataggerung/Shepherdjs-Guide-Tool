# Tessitura Guides ![GitHub Logo](/icons/24.png) 
Shepherdjs guide creation plugin soon to be available on the chrome webstore. This plugin supports selection of items on a webpage and the input of other required information for creating a step in a shepherdjs guide. It supports as many steps as required and allows managing and exporting all created guides to a JSON file.

This project is a fork of [ScrapeMate](https://github.com/hermit-crab/ScrapeMate) which has been adapted to create JSON objects in the right format for shepherdjs. This has been developed with Tessitura's web app in mind, so while it should work for any webpage it's possible it will need to be further changed if it's to be used for other purposes.

### Build
```
npm install
npm run build
# this will create ./dist/extension folder
# which you can give to chrome as an unpacked extension
# or to firefox as a temporary extension in about:debugging
```
Icon credits to: Freepik from www.flaticon.com
