/**
 * 注意: こちらのプログラムはJavaScriptで書かれていますが、Server側で動作します。
 * Note: The program written in this file runs on server side even it is written in JavaScript.
 */
'use strict';

// Config
const fs = require('fs');
const options = {
    key: fs.readFileSync('ssl/sample.key'),
    cert: fs.readFileSync('ssl/sample.crt')
};
const {keyinfo} = require('./keys/keyinfo');

// Web application
const express = require('express');
const app = express();
const ejs = require('ejs');
const bodyParser = require('body-parser')
const cookieParser = require('cookie-parser')
const https = require('https');
const http = require('http');
app.set('ejs', ejs.renderFile)
app.use(bodyParser.urlencoded({extended: true}))
app.use(bodyParser.json())
app.use(cookieParser());
const tlsAppServer = https.createServer(options, app);
const appServer = http.createServer(app);

// マルペイAPI 呼出用
const axios = require('axios');
const querystring = require('querystring');
const iconv = require('iconv-lite');

// Other
const crypto = require('crypto');

// html, css, png等の静的ファイルを配置するstaticディレクトリの読み込み設定
app.use('/static', express.static('static'));

//-------------------
// Cart Page
//-------------------
app.get('/cart', async (req, res) => {
    res.render ('cart.ejs');
});

//-------------------
// App Login Screen
//-------------------
app.get('/startSecureWebview', async (req, res) => {
    res.render (
        'startSecureWebview.ejs', 
        {client: req.query.client}
    );
});

//-------------------------
// Review Page
//-------------------------
app.get('/review', async (req, res) => {
    // 受注情報
    let order = {amazonCheckoutSessionId: req.query.amazonCheckoutSessionId,
        client: req.cookies.client, hd8: req.cookies.hd8, hd10: req.cookies.hd10, items: []};
    console.log(`AmazonCheckoutSessionID: ${order.amazonCheckoutSessionId}`);
    order.items.push({id: 'item0008', name: 'Fire HD8', price: 8980, num: parseInt(order.hd8)});
    order.items.push({id: 'item0010', name: 'Fire HD10', price: 15980, num: parseInt(order.hd10)});
    order.items.forEach(item => item.summary = item.price * item.num); // 小計
    order.price = order.items.map(item => item.summary).reduce((pre, cur) => pre + cur); // 合計金額
    order.chargeAmount = Math.floor(order.price * 1.1); // 税込金額

    // Amazon Pay受注情報
    const address = await callAPI('SearchAddressAmazonpay', 
        {AmazonCheckoutSessionID: order.amazonCheckoutSessionId, ...keyinfo});
    // address.AmazonCheckoutSessionID = req.query.amazonCheckoutSessionId;
    order.address = address;

    // Note: 一般的には受注情報はSessionやDBなどを使ってServer側に保持しますが、本サンプルではシンプルにするためにCookieを使用しています
    res.cookie('session', JSON.stringify(order), {secure: false}); // ここではテストのため、localhostへはhttpでアクセスするため、secure属性を付与しない。
    
    res.render('review.ejs', order);
});

//-----------------------------
// Checkout Session Update API
//-----------------------------
app.post('/checkoutSession', async (req, res) => {
    const order = JSON.parse(req.cookies.session);
    order.id = crypto.randomBytes(13).toString('hex');
    console.log(`OrderID: ${order.id}`);

    order.access = await callAPI('EntryTranAmazonpay', {
        ...keyinfo,
        OrderID: order.id,
        JobCd: 'AUTH',
        Amount: `${order.chargeAmount}`,
        AmazonpayType: '4',
    });

    const url = order.client === 'browser' ? "https://localhost:3443/thanks" :
        `https://${order.client === 'iosApp' ? 'localhost' : '10.0.2.2'}:3443/endSecureWebview?client=${order.client}`;
    order.start = await callAPI('ExecTranAmazonpay', {
        ...keyinfo,
        ...order.access,
        OrderID: order.id,
        RetURL: url,
        AmazonCheckoutSessionID: order.amazonCheckoutSessionId,
        Description: "ご購入ありがとうございます。",
    });

    // Note: 一般的には受注情報はSessionやDBなどを使ってServer側に保持しますが、本サンプルではシンプルにするためにCookieを使用しています
    res.cookie('session', JSON.stringify(order), {secure: false});

    const params = Object.keys(order.start).map(k => `${k}=${encodeURIComponent(order.start[k])}`).join('&');

    res.writeHead(200, {'Content-Type': 'application/json; charset=UTF-8'});
    res.write(JSON.stringify({params}));
    res.end()
});

app.post('/endSecureWebview', async (req, res) => {
    console.log(req.query.client);
    // Objectをkey1=value1&key2=value2...の形に変換する.
    const plainParams = Object.keys(req.body).map(k => `${k}=${encodeURIComponent(req.body[k])}`).join('&');
    const params = encodeURIComponent(plainParams);
    console.log(params);

    res.render('endSecureWebview.ejs', {client: req.query.client, params: params});
});

//-------------------
// Thanks Screen
//-------------------
app.post('/thanks', async (req, res) => {
    const order = JSON.parse(req.cookies.session);
    console.log(`OrderID: ${order.id}`);
    console.log(`AmazonpayStart: ${JSON.stringify(req.body, null, 2)}`);

    // Security Check
    const textToHash = `${order.id}${order.access.AccessID}${keyinfo.ShopID}${keyinfo.ShopPass}${req.body.AmazonChargePermissionID}`;
    const hash = crypto.createHash('sha256').update(textToHash).digest('hex');
    console.log(`Hash: ${hash}`);
    if(hash !== req.body.CheckString) throw new Error('CheckStringが一致しません。');

    // 注文確定
    order.sales = await callAPI('AmazonpaySales', {
        ...keyinfo,
        ...order.access,
        OrderID: order.id,
        Amount: `${order.chargeAmount}`,
    });

    // Note: 一般的には受注情報はSessionやDBなどを使ってServer側に保持しますが、本サンプルではシンプルにするためにCookieを使用しています
    order.result = req.body;
    res.cookie('session', JSON.stringify(order), {secure: false});

    res.render('thanks.ejs', order);
});

//-------------------
// Libraries
//-------------------
async function callAPI(name, params) {
    const res = await axios.post(`https://pt01.mul-pay.jp/payment/${name}.idPass`,
        querystring.stringify(params));
    if(res.statusText !== 'OK') throw new Error(`${res.status} エラーが発生しました。再度やり直して下さい。`);
    const obj = {};
    res.data.split('&').forEach((item) => {
        const [key, value] = item.split('=');
        obj[key] = key === 'Token' ? value : decodeWin31j(value);
            // Note: Tokenという項目のみ、x-www-form-urlencodedのエンコード仕様に反して「+」がエンコードされていないため、decode対象から外す。
    });
    if(obj.ErrCode) throw new Error(`${JSON.stringify(obj)} エラーが発生しました。再度やり直して下さい。`);

    console.log(`${name}: ${JSON.stringify(obj, null, 2)}`);
    return obj;
}

function decodeWin31j(text) {
    // 1. x-www-form-urlencodedなので、空白が「+」になっており、まずはこちらをdecode。
    // なお、下記によると変換されない記号に「+」が含まれていない。∴この時点では「%2B」のはず。よってこの処理は安全。
    // https://qiita.com/sisisin/items/3efeb9420cf77a48135d#applicationx-www-form-urlencoded%E3%81%AEurl%E3%82%A8%E3%83%B3%E3%82%B3%E3%83%BC%E3%83%89%E3%81%AB%E3%81%A4%E3%81%84%E3%81%A6
    const blankDecodedString = text.replace(/\+/g, ' ');

    // 2. percent-encodingされたバイト列を取得
    //    ( decodeURIComponent は UTF-8 を前提とするため、一旦 % を取り除く)
    const escapedBytes = Buffer.from(blankDecodedString.replace(
        /%([0-9A-Fa-f]{2})/g, (match, p1) => String.fromCharCode(parseInt(p1, 16))), 'binary');

    // 3. そのバイト列を Shift_JIS (Windows-31J) としてデコード
    return iconv.decode(escapedBytes, 'Windows-31J');
}

//---------------------
// Start App server
//---------------------
appServer.listen(3080);
tlsAppServer.listen(3443);
console.log(`App listening on port 3080(HTTP) and 3443(HTTPS).`);
