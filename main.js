const electron = require('electron');
const puppeteer = require('puppeteer');
const BrowserWindow = electron.BrowserWindow;
const path = require('path');
const app = electron.app;
const url = require('url');
const ipc = require('electron').ipcMain;
const cookies = require('./cookies');

const giveAwayUrl = "https://www.amazon.com/ga/giveaways?pageId=";
const do_not_load_resources = false;

const loser = "you didn't win";
const default_text = 'Enter for a chance to win!';

let mainWindow, count = 1, browser = null, page = null;
let tabCard = null, pageResults = [], parent = null;
let operation = {page:'',product:'',operation:''};

ipc.on('initTask', function (event) {
    parent = event;
    startBrowser();
});

async function click(page, selector){
    await page.evaluate((selector) => {
        $(selector).trigger('click');
        return null
    },selector);
}

async function getText(page, selector){
    const element = await page.$(selector);
    return await page.evaluate(element => element.textContent, element);
}

async function checkElementMessage(page) {
    try{
        const text = await getText(page,".prize-title");
        if (text.indexOf(loser) === -1 && text !== default_text) {
            console.log("-- Looks like you won something here --", text);
        } else {
            console.log(text);
        }
    }catch(error){
        console.log("Error: ",error, " Function: checkElementMessage", " Operation: ",operation);
    }
}

async function setPageConfigs(page) {
    await page.setRequestInterception(do_not_load_resources);
    await cookies.config(page);
    /*
    * This is just a file I've created to define my cookies, you don't need to really use this function
    * await cookies.config(page) or import the const cookies = require('cookies'); that is not included in the
    * repository if you don't want it, basically you can just specify all your cookies using the format
    * bellow, as many as you want
    * await page.setCookie({name: 'session-id', value: '132-51130643-1691833', domain: '.amazon.com'});
    * */
    await page.setUserAgent("Mozilla/5.0 (Windows NT 10.0; WOW64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/53.0.2785.143 Safari/537.36");

    if (do_not_load_resources) {
        page.on('request', request => {
            if (request.resourceType().toString() === 'image' || request.resourceType().toString() === 'stylesheet')
                request.abort();
            else
                request.continue();
        });
    }
}

async function checkVideo(page, chance) {
    try {
        await page.goto(chance.link, {waitUntil: 'networkidle2'});
        await page.addScriptTag({url: 'https://code.jquery.com/jquery-3.2.1.min.js'});

        const proceed = async function(page){
            await click(page, ".youtube-video div:first");
            await page.waitFor(17000);
            await click(page, ".youtube-continue-button");
            await page.waitFor(5000);
            await page.waitFor('.prize-title');
            await checkElementMessage(page);
        };

        console.log("Video / Product: ", await page.url());

        operation.product = chance.link;
        operation.operation = 2;

        if (await page.$('.airy-install-flash-prompt') === null) { //if the video content is flash
            if (await page.$('.prize-title') !== null) {
                const text = await getText(page,".prize-title");
                if(text === default_text){
                    await proceed(page);
                }else{
                    await checkElementMessage(page);
                }
            } else {
                await proceed(page);
            }
        }
    } catch (error) {
        console.log("Error: ",error, " Function: checkVideo", " Operation: ",operation);
    }
}

async function checkText(page, chance) {
    try {
        await page.goto(chance.link, {waitUntil: 'networkidle2'});
        await page.addScriptTag({url: 'https://code.jquery.com/jquery-3.2.1.min.js'});

        const proceed = async function(page){
            await page.waitFor(2000);
            await page.click('.box-click-area');
            await page.waitFor(5000);
            await page.waitFor('.prize-title');
            await checkElementMessage(page);
        };
        console.log("Texto / Product: ", await page.url());

        operation.product = chance.link;
        operation.operation = 3;

        if (await page.$('.prize-title') !== null) {
            const text = await getText(page,".prize-title");
            if(text.toString() === default_text.toString()){
                await proceed(page);
            }else{
                await checkElementMessage(page);
            }
        } else {
            await proceed(page);
        }
    } catch (error) {
        console.log("Error: ",error, " Function: checkText", " Operation: ",operation);
    }
}

async function checkGiveaways(pageCard, chance) {
    try {
        if (pageResults.length > 0) {
            chance = pageResults[0];
            if (chance.type.toString() === 'Watch a short video') {
                await checkVideo(pageCard, chance);
            } else {
                await checkText(pageCard, chance)
            }
            pageResults.splice(0, 1);
            await checkGiveaways(pageCard);
        } else {
            await pageCard.close();
            await walkThroughPagination();
        }
    } catch (error) {
        console.log("Error: ",error, " Function: checkGiveaways", " Operation: ",operation);
    }
}

async function collectGiveAways() {
    await page.waitFor('.listing-page');
    await page.addScriptTag({url: 'https://code.jquery.com/jquery-3.2.1.min.js'});

    pageResults = await page.evaluate(() => {
        var data = [];

        $('.listing-item').find('.standard-card').each(function () {
            const link = 'https://www.amazon.com' + $(this).find('.item-link').attr('href');
            const type = $(this).find('.prize-requirement').text();

            data.push({
                'link': link,
                'type': type
            });
        });
        return data;
    });

    tabCard = await browser.newPage().then(async pageCard => {
        await setPageConfigs(pageCard);
        await checkGiveaways(pageCard);
    }).then(async (pageCard) => {
    }).catch((err) => {
            console.log("Something went wrong: ", err)
    })
}

/*
#pagination_buttonNext →
* */

async function walkThroughPagination(){
    const url = (giveAwayUrl + count.toString());
    await page.goto(url, {waitUntil: 'networkidle2'});

    operation.url = url;
    operation.operation = 1;

    console.log("Products: ", await page.url());
    if (await page.$('#giveaway-listing-page-no-giveaway') === null) {
        count++;
        await collectGiveAways();
    } else {
        console.log("Script reached the end...");
    }
}

async function startBrowser() {
    await puppeteer.launch({headless: false}).then(async brw => {
        browser = brw;
        let browserTab = await browser.newPage().then(async pg => {
            page = pg;
            await setPageConfigs(page);
            await walkThroughPagination();
        })
            .then(async (page) => {
            })
            .catch((err) => {
                console.log("Something went wrong: ", err)
            })
    })
        .then(async (page) => {
        })
        .catch((err) => {
            console.log("Something went wrong: ", err)
        })
}

function createWindow() {
    mainWindow = new BrowserWindow({alwaysOnTop: true, width: 800, height: 600})
    mainWindow.loadURL(url.format({
        pathname: path.join(__dirname, 'index.html'),
        protocol: 'file:',
        slashes: true
    }))

    mainWindow.setMenu(null);

    // Open the DevTools.
    //mainWindow.webContents.openDevTools();
    mainWindow.on('closed', function () {
        mainWindow = null
    })
}

app.on('ready', createWindow)
app.on('window-all-closed', function () {
    if (process.platform !== 'darwin') {
        app.quit()
    }
})

app.on('activate', function () {
    if (mainWindow === null) {
        createWindow()
    }
})