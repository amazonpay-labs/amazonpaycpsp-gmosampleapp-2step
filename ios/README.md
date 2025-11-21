# Amazon Pay モバイル サンプルアプリ iOS編
GMO Payment Gateway Amazon Pay cPSP の2ステップ決済機能を使用したモバイルサンプルアプリの、iOSアプリ側の実装です。インストールして動作させる方法については、[こちら](./README_install.md)をご参照下さい。

# 動作環境
iOS バージョン12.3.1以降: Safari Mobile 12以降  
[参考] https://pay.amazon.com/jp/help/202030010

# その他の前提条件
本サンプルアプリではUniversal Linksという技術を使っており、こちらを利用するためには下記の条件が必要です。
 - [Apple Developer Program](https://developer.apple.com/jp/programs/)に登録していること 
 - Web上のhttpsで正しくアクセスできる場所に設定ファイルを配置する必要があるので、ECサイトとは別ドメインのサーバーか、AWS等のクラウドサービスのアカウントを保有していること  
   Note: 本サンプルアプリでは、[Amazon S3](https://aws.amazon.com/jp/s3/)を利用しています。  

# 概要
本サンプルアプリは、下記動画のように動作いたします。

<img src="docimg/ios-movie.gif" width="300">  

以後詳細な実装方法について解説します。

# Amazon Payの実装方法

## カートページ

<img src="docimg/cart.png" width="300">  

### モバイルアプリのJavaScript側からのCallback受付の設定
モバイルアプリではAmazon Payの処理はSecure WebView上で実行する必要がありますが、WebViewから直接Secure WebViewは起動できないため、WebViewのJavaScriptから一旦Nativeコードを起動できるよう設定する必要があります。  
それを行うのが下記のコードです。  

```swift
// ViewController.swiftから抜粋 (見やすくするため、一部加工しています。)

            // JavaScript側からのCallback受付の設定
            let userContentController = WKUserContentController()
            userContentController.add(self, name: "iosApp")
            let webConfig = WKWebViewConfiguration();
            webConfig.userContentController = userContentController
                :
extension ViewController: WKScriptMessageHandler {
    // JavaScript側からのCallback.
    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        print("ViewController#userContentController")
                :
    }
}
```

このように設定すると、下記のようにJavaScript側からNative側にメッセージを送信することが可能になります。
```js
        webkit.messageHandlers.iosApp.postMessage(data);
```

### カートページ表示

モバイルアプリを起動すると、下記コードによりWebView上で`http://localhost:3080/cart` へリクエストが送信されます。  

```swift
// ViewController.swiftから抜粋 (見やすくするため、一部加工しています。)

            // WebViewの生成、cartページの読み込み
            webView = WKWebView(frame: rect, configuration: webConfig)
            let webUrl = URL(string: "http://localhost:3080/cart")!
            let myRequest = URLRequest(url: webUrl)
            webView.load(myRequest)
            
            // 生成したWebViewの画面への追加
            self.view.addSubview(webView)
```

これにより、nodejsサーバーにて下記が実行されます。  

```js
// app.jsから抜粋 (見やすくするため、一部加工しています。)

//-------------------
// Cart Page
//-------------------
app.get('/cart', async (req, res) => {
    res.render ('cart.ejs');
});
```

これにより、`/nodejs/views/cart.ejs`のテンプレートが読み込まれて、cartページが描画されます。  

### クライアント判定
本サンプルアプリでは、同一のHTML/JavaScriptの画面でAndroid/iOS/通常のBrowserの全てに対応しております。  
そのため、動作環境に応じて処理を切り替える必要がある場合には、クライアントを判定して条件分岐を行う必要があります。  
それを行っているのが、下記のJavaScriptのコードです。

```js
// nodejs/views/sample/cart.ejsより抜粋

    let client = "browser";
    if(window.androidApp) {
        client = "androidApp";
    } else if(window.webkit && webkit.messageHandlers && webkit.messageHandlers.iosApp) {
        client = "iosApp";
    }
    document.cookie = "client=" + client + ";path=/"; // ここではテストのため、localhostへはhttpでアクセスするため、secure属性を付与しない。
```

上記「モバイルアプリのJavaScript側からのCallback受付の設定」で設定されたCallback用のObjectの存在確認を行うことで、それぞれ何の環境なのかを判定しています。  
判定結果はServer側でも参照できるよう、Cookieに設定しています。  

### 「Amazon Payボタン」画像の配置

Amamzon Payで支払いができることをユーザに視覚的に伝えるのには、Amazon Payボタンを画面に表示するのが効果的です。  
WebView上では本物のAmazon Payボタンを配置できないので、ここでは画像を代わりに配置しています。

それを行っているのが、下記のJavaScriptです。
```js
// nodejs/views/sample/cart.ejsより抜粋 (見やすくするため、一部加工しています。)

    if(client === 'browser') {
        amazon.Pay.renderButton('#AmazonPayButton', {
            :
        });
    } else {
        let node = document.createElement("input");
        node.type = "image";
        node.src = "/static/img/button_images/Gold/Sandbox-ja_jp-amazonpay-gold-large-button_T2.png";
        node.style.width = "90%";
        node.addEventListener('click', (e) => {
            coverScreen();
            if(client === 'androidApp') {
                        :
            } else {
                webkit.messageHandlers.iosApp.postMessage({op: 'startSecureWebview'}); // ← ボタン画像クリック時に、こちらが実行される.
            }
        });
        document.getElementById("AmazonPayButton").appendChild(node);
    }
```

最初の判定で、通常のBrowserだった場合にはそのままAmazon Payの処理が実施できるので、通常通りAmazon Payボタンを読み込んでいます。  
iOSの場合は、「Amazon Payボタン」画像のnodeを生成して同画面内の「AmazonPayButton」ノードの下に追加しています。  
この時指定する「Amazon Payボタン」画像は「./nodejs/static/img/button_images」の下にあるものから選ぶようにして下さい。なお、本番環境向けにファイル名が「Sandbox_」で始まるものを指定しないよう、ご注意下さい。  
またaddEventListenerにより、ボタン画像がclickされたときに「startSecureWebview」を指定したObjectをパラメタとしてNative側のCallbackを呼び出します。  

### 「Amazon Payボタン」画像クリック時の、Secure WebViewの起動処理
上記、「Amazon Payボタン」画像がクリックされたときに呼び出されるNative側のコードが、下記になります。  

```swift
// ViewController.swiftから抜粋 (見やすくするため、一部加工しています。)

extension ViewController: WKScriptMessageHandler {
    // JavaScript側からのCallback.
    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        print("ViewController#userContentController")
        switch message.name {
        case "iosApp":
            print("iosApp")
            
            if let data = message.body as? NSDictionary {
                print(data)
                let op = data["op"] as! String?
                switch op! {
                case "startSecureWebview":
                    startSecureWebview()
                        :
                }
            }
        default:
            return
        }
    }
}
```

「startSecureWebview()」の処理が、下記になります。  
```swift
// ViewController.swiftから抜粋 (見やすくするため、一部加工しています。)
class ViewController: UIViewController {

    var secureToken: String?
        :
    func startSecureWebview() {
        print("ViewController#startSecureWebview")
        
        secureToken = UUID().uuidString.lowercased()
        let safariView = SFSafariViewController(url: NSURL(string: "https://localhost:3443/startSecureWebview?client=iosApp&secureToken=\(secureToken!)")! as URL)
        present(safariView, animated: true, completion: nil)
    }
        :
}
```

URLを指定して、SFSafariViewController(iOS側のSecure WebView)を起動しています。  
なお、UUID(version 4)を生成して「secureToken」という名前で、Native側のFieldと起動するURLのパラメタとして設定しています。これは後続の処理で特定のページやアプリへの遷移の妥当性をチェックするために利用します。  

## Amazonログイン画面への自動遷移

指定されたURLで開くページにて、「initCheckout」というメソッドをJavaScriptでcallすることで、Amazonログイン画面に遷移させています。  

### ページの描画

Secure WebView上で`https://localhost:3443/startSecureWebview?client=iosApp&secureToken=xxxx`へのリクエストが送信されると、nodejs側で下記が呼び出されます。  

```js
// nodejs/app.jsより抜粋 (見やすくするため、一部加工しています。)

//------------------------------------------------
// Start Secure WebView Page (Only for MobileApp)
//------------------------------------------------
app.get('/startSecureWebview', async (req, res) => {
    res.render (
        'startSecureWebview.ejs', 
        {client: req.query.client}
    );
});
```

`req.query.client`はURLパラメタの「client」を表しており、この場合は指定された「iosApp」が値となります。これをパラメタとして、`/nodejs/views/startSecureWebview.ejs`のテンプレートが読み込まれてページが描画され、下記スクリプトが実行されます。  

```js
// nodejs/views/sample/startSecureWebview.ejsより抜粋 (見やすくするため、一部加工しています。)

    document.cookie = `secureToken=${getURLParameter('secureToken', location.search)}; path=/;` // CookieにsecureTokenを保存

    amazon.Pay.initCheckout({
            :
        // configure Create Checkout Session request
        createCheckoutSessionConfig: {                     
<% if (client === 'iosApp') { // iOS・Android間でSimulatorからのHost OSのlocalhostの表現方法の違いを吸収するための分岐。本番や検証サーバーではこの分岐は必要ない。 %>
            payloadJSON: '{"webCheckoutDetails"....',
            signature: 'kBYcZSLBEgVFSjsK...',
<% } else { %>
                :
<% } %>
            publicKeyId: 'SANDBOX-AGH2Y6VC2VAUJ27GG6VDFOTD',
            algorithm: 'AMZN-PAY-RSASSA-PSS-V2'
        }
    });
```
※ <% 〜 %>で囲まれた部分はサーバー側でテンプレートとして実行される部分で、この場合はパラメタ「client」の値として「iosApp」が渡されているため、「else」より前の括弧内が描画されます。  

こちらのスクリプトにより、cookieにURLパラメタ「secureToken」として渡された値が設定された後、initCheckoutが実行されてAmazon Payのログイン画面に自動遷移します。  

### Code GeneratorによるinitCheckoutスクリプトの生成方法

initCheckoutの呼び出し処理のスクリプトはパラメタの正当性を担保するためのsignatureを計算して渡す必要があるなど、仕様が少々複雑です。
しかし、[Code Generator](https://www.amazonpay-integration.com/v2/code-generator/signature-generator.html?processorSpecifications=gmopg)というツールを使うことで簡単に生成できます。  
※ GMOPGの管理ページでもスクリプトの生成はできますが、一部対応していないAmazon Payの機能があるため、本サンプル用のスクリプトの生成ができません。よって、ここでは[Code Generator](https://www.amazonpay-integration.com/v2/code-generator/signature-generator.html?processorSpecifications=gmopg)をお使いください。  

[Code Generator](https://www.amazonpay-integration.com/v2/code-generator/signature-generator.html?processorSpecifications=gmopg)にアクセスすると、下記のようなページが開きます。  

![](docimg/2025-11-06-11-22-20.png)  

それぞれ下記のように入力します。  
- MerchantId - SellerCentralより取得した出品者ID(参考: https://www.amazonpay-faq.jp/faq/QA-7 )
- Type - 実装したいAmazon Payの機能に応じて選択。本サンプルでは「Onetime」を選択する。
- Store ID - SellerCentralより取得したStore ID(参考: https://www.amazonpay-faq.jp/faq/QA-7 )
- Public Key Id - SellerCentralより取得したPublic Key Id(参考: https://www.amazonpay-faq.jp/faq/QA-59 )
- Checkout Review ReturnUrl - Amazon Payで住所・支払方法選択後にリダイレクトされるURLで、通常Review画面へのURL. 本サンプルアプリ(iOS)では「https://localhost:3443/static/pauseSecureWebview.html 」。
- Private Key - SellerCentralより取得したPrivate Key(参考: https://www.amazonpay-faq.jp/faq/QA-59 )。ブラウザにUploadして使用するが、Code GeneratorではPrivate Keyはブラウザ内でしか利用せず、一切他のサーバー等には送信しないため、漏洩の心配はない。
- Product Type - 実装したいAmazon Payの機能に応じて選択。本サンプルでは「PayAndShip」を選択する。
- Scopes - Amazon Payから取得する必要のあるユーザの情報に応じて指定。本サンプルではデフォルトのままで良い。
- Checkout Cancel Url - Amazon Pay側の画面上でCancelした場合にリダイレクトされるURL。詳細は後述の「Amazon側ページ上でのCancel処理」参照。通常は指定する必要はないが、本サンプルアプリ(iOS)では「https://localhost:3443/static/cancelSecureWebview.html?client=iosApp 」。
- Sandbox - 本サンプルアプリはSandbox環境で動作させるため、「true」。本番向けには「false」を選択すること。

入力したら、「Generate Button Code Sample」ボタンをクリックします。  

![](docimg/2025-11-06-12-11-44.png)  

Resultの「Code Sample」には下記のようにAmazon Payボタンを描画するためのスクリプトが出力されます。  

```html
<!-- 見やすくするため、一部加工しています。-->

<div id="AmazonPayButton"></div>
<script src="https://static-fe.payments-amazon.com/checkout.js"></script>
<script type="text/javascript" charset="utf-8">
amazon.Pay.renderButton('#AmazonPayButton', {
    // set checkout environment
    merchantId: 'A23YM23UEBY8FM',
    ledgerCurrency: 'JPY',
    // customize the buyer experience
    checkoutLanguage: 'ja_JP',
    productType: 'PayAndShip',
    placement: 'Other',
    sandbox: true,
    buttonColor: 'Gold',
    // configure Create Checkout Session request
    createCheckoutSessionConfig: {                     
        payloadJSON: '{"webCheckoutDetails":...',
        signature: 'Fmg886mF4xY6N4qArA...',
        publicKeyId: 'SANDBOX-AGH2Y6VC2VAUJ27GG6VDFOTD',
        algorithm: 'AMZN-PAY-RSASSA-PSS-V2'
    }
});
</script>
```

これをinitCheckoutのスクリプトに変更します。実施する内容は下記の通り、呼び出すメソッドを「initCheckout」変更すること、ボタンにのみ関係する部分を除去することだけです。  

```html
<!-- 見やすくするため、一部加工しています。-->

<!-- 除去: div id="AmazonPayButton"></div -->
<script src="https://static-fe.payments-amazon.com/checkout.js"></script>
<script type="text/javascript" charset="utf-8">
// この行は↓に変更: amazon.Pay.renderButton('#AmazonPayButton', {
amazon.Pay.initCheckout({  // ← メソッド名を「initCheckout」に変更 & Amazon Payボタンのnode指定のパラメタの除去
    // set checkout environment
    merchantId: 'A23YM23UEBY8FM',
    ledgerCurrency: 'JPY',
    // customize the buyer experience
    checkoutLanguage: 'ja_JP',
    productType: 'PayAndShip',
    placement: 'Other',
    sandbox: true,
    // 除去: buttonColor: 'Gold',
    // configure Create Checkout Session request
    createCheckoutSessionConfig: {                     
        payloadJSON: '{"webCheckoutDetails":...',
        signature: 'Fmg886mF4xY6N4qArA...',
        publicKeyId: 'SANDBOX-AGH2Y6VC2VAUJ27GG6VDFOTD',
        algorithm: 'AMZN-PAY-RSASSA-PSS-V2'
    }
});
</script>
```

最終的には下記のようになるので、これをソースコードにコピペすれば完了です。  

```html
<!-- 見やすくするため、一部加工しています。-->

<script src="https://static-fe.payments-amazon.com/checkout.js"></script>
<script type="text/javascript" charset="utf-8">
amazon.Pay.initCheckout({
    // set checkout environment
    merchantId: 'A23YM23UEBY8FM',
    ledgerCurrency: 'JPY',
    // customize the buyer experience
    checkoutLanguage: 'ja_JP',
    productType: 'PayAndShip',
    placement: 'Other',
    sandbox: true,
    // configure Create Checkout Session request
    createCheckoutSessionConfig: {                     
        payloadJSON: '{"webCheckoutDetails":...',
        signature: 'Fmg886mF4xY6N4qArA...',
        publicKeyId: 'SANDBOX-AGH2Y6VC2VAUJ27GG6VDFOTD',
        algorithm: 'AMZN-PAY-RSASSA-PSS-V2'
    }
});
</script>
```

## Secure WebView上の処理を中断してアプリに戻り、WebViewで購入ページを表示

<img src="docimg/2025-11-06-13-30-48.png" width="500">  

### checkoutReviewReturnUrlへのリダイレクト
Amazon Payのページにて住所・支払方法を選択し、「続行」ボタンを押下すると、initCheckoutでCheckout Review ReturnUrlに指定した「https://localhost:3443/static/pauseSecureWebview.html 」に対してURLパラメタ`amazonCheckoutSessionId`が付与されたURLへのリダイレクトが実行されます。  
これにより、`nodejs/static/pauseSecureWebview.html`が描画されます。  

```html
// nodejs/static/pauseSecureWebview.htmlより抜粋 (見やすくするため、一部加工しています。)

        :
    <a id="nextButton" href="#" class="btn btn-info btn-lg btn-block">
        次　へ
    </a>
        :
<script>
    document.getElementById("nextButton").href = 
        "https://dzpmbh5sopa6k.cloudfront.net/index.html" 
            + location.search + '&'
            + document.cookie.split('; ').find(function(kv) {return kv.startsWith('secureToken=')}); // CookieよりsecureTokenを取得
</script>
        :
```

画面上に「次へ」ボタンのあるページが表示されます。  
スクリプトにより、この「次へ」ボタンにアプリを起動するUniversal LinksのURLを指定しています。  
※ Universal Linksについての詳細については、[こちら](./README_swv2app.md)に記載しております。  
また、アプリにURLパラメタとして渡すため、下記をそれぞれ付与しています。  
- 「location.search」を通じてamazonCheckoutSessionId
- Cookieに保存されているsecureToken

これにより、「次へ」ボタンが押下されるとUniversal Linksが発動し、アプリのNativeコードが起動されます。  

### tokenチェックとViewControllerへの遷移先URLの設定
Universal Linksにより起動されるNaiveコードは、下記になります。  

```swift
// AppDelegateより抜粋　(見やすくするため、一部加工しています。)

    func application(_ application: UIApplication, continue userActivity: NSUserActivity, restorationHandler: @escaping ([UIUserActivityRestoring]?) -> Void) -> Bool {
        print("Universal Links!")
        if userActivity.activityType == NSUserActivityTypeBrowsingWeb {
            print(userActivity.webpageURL!)

            // URLパラメタのパース
            var urlParams = Dictionary<String, String>.init()
            for param in userActivity.webpageURL!.query!.components(separatedBy: "&") {
                let kv = param.components(separatedBy: "=")
                urlParams[kv[0]] = kv[1].removingPercentEncoding
            }
            
            // ViewControllerの取得
            let vc:ViewController? = UIApplication.shared.keyWindow?.rootViewController as? ViewController
            // SFSafariViewConrollerの取得(表示されていた場合のみ)
            let sfsv = vc?.presentedViewController
            
            if (vc?.secureToken! == urlParams["secureToken"]!) { // tokenの一致判定
                // 一致した場合には、購入ページのURLをViewControllerに設定
                vc?.webviewUrl = "/review?amazonCheckoutSessionId=\(urlParams["amazonCheckoutSessionId"]!)"
            } else {
                // 不一致の場合には不正な遷移であるため、エラーページを設定
                vc?.webviewUrl = "static/sample/error.html"
            }

            // SFSafariViewのclose (この後、ViewController#viewDidLoadに処理が移る)
            (sfsv as? SFSafariViewController)?.dismiss(animated: false, completion: nil)
        }
        return true
    }
```
まず、Universal Links発動のURLに指定されていたURLパラメタを取得します。  
次にApplicationの履歴階層から、この時点で最前面に表示されているSFSafariViewControllerと、そのすぐ下のViewControllerを取得します。  

その後、「『Amazon Payボタン』画像クリック時の、Secure WebViewの起動処理」でViewControllerに保持したsecureTokenと、Secure WebViewから受け渡されたsecureTokenの一致判定を行っています。  
このsecureTokenの判定を行うことで、不正な遷移でこの処理が起動された場合に、それを検出してエラーとできるようになります。  

tokenチェックの後は、購入ページのURLをViewControllerに設定します。  
購入ページのURLには「amazonCheckoutSessionId」をURLパラメタを付与しますが、これはPC・Mobileのブラウザでの購入ページへの遷移と全く同じURL・全く同じ条件になります。  
よって、この後の購入ページの表示では「モバイルアプリ向け」「PC・Mobileのブラウザ向け」で別々の処理を実装する必要はありません。  

最後に、SFSafariView(Secure WebView)をcloseします。これにより、すぐ下のViewController#viewDidLoadに処理が移ります。  

### 購入ページの読み込み

ViewControllerでは、viewDidLoadの中の下記の処理が起動します。  

```swift
// ViewControllerより抜粋　(見やすくするため、一部加工しています。)

                    :
            let url = webviewUrl
            webviewUrl = nil
                    :
            if(url != nil) {
                webView.evaluateJavaScript("loadUrl('\(url!)')", completionHandler: nil)
                    :
```

WebViewではこの時点でカートページが表示されており、上記にて下記のJavaScriptが起動して購入ページの読み込みが開始します。  

```js
// nodejs/views/sample/cart.ejsより抜粋 (見やすくするため、一部加工しています。)

    function loadUrl(url) {
        location.href = url;
    }
```

Server側では下記が実行されます。

```js
// nodejs/app.jsより抜粋 (見やすくするため、一部加工しています。)

//-------------------------
// Review Page
//-------------------------
app.get('/review', async (req, res) => {
    try {
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
        order.address = address;

        // Note: 一般的には受注情報はSessionやDBなどを使ってServer側に保持しますが、本サンプルではシンプルにするためにCookieを使用しています
        res.cookie('session', JSON.stringify(order), {secure: false}); // ここではテストのため、localhostへはhttpでアクセスするため、secure属性を付与しない。
        
        res.render('review.ejs', order);
    } catch (err) {
        console.error(err);
        res.redirect('/static/sample/error.html');
    }
});
```

cartの情報を計算して金額を出し、またGMOPG APIより住所情報等を取得し、`review.ejs`に渡してページを描画します。

## 購入ボタンクリック時の処理

<img src="docimg/2025-11-07-09-42-19.png" width="300">  

### Ajaxでのサーバー側トランザクション実行処理呼び出し

購入ボタンをクリックすると、下記のScriptが実行されます。

```js
// nodejs/views/review.ejsより抜粋 (見やすくするため、一部加工しています。)

            :
    //-------------
    // 購入ボタン
    //-------------
    document.getElementById("purchaseButton").addEventListener('click', (e) => {
        $.ajax({
            type: 'POST',
            url: '/checkoutSession',
            data: {},
        })
        .then(
            :
```

Ajaxにより、下記のServer側の処理が呼び出されます。  

```js
// nodejs/app.jsより抜粋 (見やすくするため、一部加工しています。)

//-------------------------------
// Checkout Session Update API
//-------------------------------
app.post('/checkoutSession', async (req, res) => {
    try {
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

        // ExecTranAmazonpayの戻り値のObjectを、"key1=value1&key2=value2..."の形式に変換
        const params = Object.keys(order.start).map(k => `${k}=${encodeURIComponent(order.start[k])}`).join('&');

        res.writeHead(200, {'Content-Type': 'application/json; charset=UTF-8'});
        res.write(JSON.stringify({params}));
    } catch (err) {
        console.error(err);
        res.writeHead(500, {'Content-Type': 'application/json; charset=UTF-8'});
    }
    res.end()
});
```

GMOPG APIを使って、決済に必要な購入金額や事業者側の受注番号等の情報と、支払い処理ページ(後述)で自動的にリダイレクトされるURL等を登録してトランザクションの実行を処理します。  
この、「支払い処理ページで自動的にリダイレクトされるURL」ですが、Browserの場合は直接ThanksページのURLを、iOS及びAndroidの場合は中継用ページ(後述)へのURL(https://localhost:3443/endSecureWebview?client=iosApp)を、それぞれ指定します。  
GMOPG APIからの戻り値は、"key1=value1&key2=value2..."の形式に変換してResponseとして返却します。  

### 再度Secure WebViewを起動

AjaxのResponseが返ってくると、下記が実行されます。

```js
// nodejs/views/review.ejsより抜粋 (見やすくするため、一部加工しています。)

            :
    document.getElementById("purchaseButton").addEventListener('click', (e) => {
        $.ajax({
            :
        })
        .then(
            function(json) { //success
                console.log(json);
                if(json.params) {
                    if(window.androidApp) {
                        :
                    } else if(window.webkit && webkit.messageHandlers && webkit.messageHandlers.iosApp) {
                        coverScreen();
                        webkit.messageHandlers.iosApp.postMessage({op: 'resumeSecureWebview', ...json});            
                    } else {
                        :
                    }
                } else {
                    :
            },
                    :
        );
    });
```

WebViewに渡されたCallback Objectの存在チェックにより、クライアントの環境を判定して対応する処理を実行します。  
今回はiOSなので、下記が実行されます。

```js
                        webkit.messageHandlers.iosApp.postMessage({op: 'resumeSecureWebview', ...json});
```

これにより、文字列「resumeSecureWebview」とResponseに含まれていた値をパラメタとして、Native側の下記の処理が実行されます。  

```swift
// ViewController.swift より抜粋 (見やすくするため、一部加工しています。)

    // JavaScript側からのCallback.
    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        print("ViewController#userContentController")
        switch message.name {
        case "iosApp":
            print("iosApp")
            
            if let data = message.body as? NSDictionary {
                print(data)
                let op = data["op"] as! String?
                switch op! {
                        :
                case "resumeSecureWebview":
                    resumeSecureWebview(data["params"] as! String)
                        :
                }
            }
        default:
            return
        }
    }
```

「resumeSecureWebview」は下記です。

```swift
    func resumeSecureWebview(_ params: String) {
        print("ViewController#resumeSecureWebview")
        let safariView = SFSafariViewController(url: NSURL(string: "https://localhost:3443/static/resumeSecureWebview.html?\(params)&secureToken=\(secureToken!)")! as URL)
        present(safariView, animated: true, completion: nil)
    }
```

以上により、Secure WebViewを、「https://localhost:3443/static/resumeSecureWebview.html 」に下記をURLパラメタとして付与したURLで起動します。
- GMOPG APIのEntryTranAmazonpayの戻り値
- secureToken

## 支払い処理ページ

<img src="docimg/2025-11-07-11-14-46.png" width="300">  

### 支払い処理ページへの遷移

resumeSecureWebview.htmlを開くと、下記のスクリプトが実行されます。  

```html
<!-- nodejs/static/resumeSecureWebview.htmlより抜粋 (見やすくするため、一部加工しています。) -->

                    :
    <form id="AmazonpayRedirectCall" method="POST">
        <input type="hidden" id="AccessID" name="AccessID">
        <input type="hidden" id="Token" name="Token">
    </form>
    
    <script>
                    :
            const arc = document.getElementById('AmazonpayRedirectCall');
            arc.action = getURLParameter("StartURL", location.search);
                    :
                document.getElementById('AccessID').value = getURLParameter("AccessID", location.search)
                document.getElementById('Token').value = getURLParameter("Token", location.search);
                arc.submit();
                    :
    </script>
                    :
```

GMOPG APIのEntryTranAmazonpayの戻り値として渡された、StartURLに対して、AccessID・TokenをパラメタとしてPOSTリクエストを送信します。  
※ 上記で省略した部分を確認すると分かりますが、実際にはOpen Redirector対策としてsecureTokenとdomainのチェックも合わせて実施しています。  
これにより、GMOPGのページを経由して、Amazon Payの支払い処理ページ(スピナーページとも呼ばれます)が表示されます。  
この画面が表示されている間、Amazon側ではServer側で与信を含む支払いの処理が行われており、エラーハンドリングも含めてこちらの画面で処理されています。  
支払いの処理が終わると、「Ajaxでのサーバー側トランザクション実行処理呼び出し」で指定した中継用ページへのURLに自動的にPOSTリクエストが送信されます。  

### 中継用ページ

中継用ページのURLは「https://localhost:3443/endSecureWebview?client=iosApp 」で、これによりnodejsの下記の処理が起動します。  

```js
// nodejs/app.jsより抜粋 (見やすくするため、一部加工しています。)

//------------------------------------------------
// End Secure WebView Page (Only for MobileApp)
//------------------------------------------------
app.post('/endSecureWebview', async (req, res) => {
    console.log(req.query.client);
    // Objectをkey1=value1&key2=value2...の形に変換する.
    const plainParams = Object.keys(req.body).map(k => `${k}=${encodeURIComponent(req.body[k])}`).join('&');
    const params = encodeURIComponent(plainParams);
    console.log(params);

    res.render('endSecureWebview.ejs', {client: req.query.client, params: params});
});
```

GMOPGからPOSTで送信されたパラメタを「key1=value1&key2=value2...」の形式に変換し、clientパラメタ(値: iosApp)と共にパラメタとして`endSecureWebview.ejs`に渡して描画します。  

```js
// nodejs/views/endSecureWebview.ejsより抜粋 (見やすくするため、一部加工しています。)
            :
<% if (client === 'iosApp') { %>
        const appUri = 'amazonpay-ios-v2://thanks?params=<%= params %>';
<% } else { %>
            :
<% } %>
        // 自動的にアプリに戻る
        location.href = appUri;
            :
```
※ <% 〜 %>で囲まれた部分はサーバー側でテンプレートとして実行される部分で、この場合はパラメタ「client」の値として「iosApp」が渡されているため、「else」より前の括弧内が描画されます。  

このスクリプトのより、GMOPGからPOSTで送信されたパラメタを付与されたCustomURLSchemeが自動で発動し、アプリが呼び出されます。
※ CustomURLSchemeについての詳細については、[こちら](./README_swv2app.md)をご参照下さい。  

なお上記で省略されたスクリプトを確認すると分かりますが、実際にはアプリがBackground状態だと稀にCustomURLSchemeが発動しない場合があることを考慮し、自動で発動しなかった場合にCustomURLSchemeを発動させるボタンを補助的に表示するようにしています。  

## Thanksページ

<img src="docimg/2025-11-07-14-50-38.png" width="230">  

### CustomURLSchemeにより起動されるNativeの処理

上記CustomURLSchemeにより起動されるNativeの処理は、下記になります。

```swift
// AppDelegate.swift より抜粋

    func application(_ app: UIApplication, open url: URL, options: [UIApplication.OpenURLOptionsKey : Any] = [:]) -> Bool {
        print("Custom URL Scheme!")
        print(url)
        
        // ViewControllerの取得
        let vc:ViewController? = UIApplication.shared.keyWindow?.rootViewController as? ViewController
        // SFSafariViewConrollerの取得(表示されていた場合のみ)
        let sfsv = vc?.presentedViewController

        if(url.host! == "thanks") { // Thanksページ表示
            // URLパラメタのパース
            var urlParams = Dictionary<String, String>.init()
            for param in url.query!.components(separatedBy: "&") {
                let kv = param.components(separatedBy: "=")
                urlParams[kv[0]] = kv[1].removingPercentEncoding
            }
            // Thanksページ起動のパラメータをViewControllerに設定
            vc?.webviewParams = urlParams["params"]!
        } else { // Cancel
                    :
        }
        
        // SFSafariViewのclose (この後、ViewController#viewDidAppearに処理が移る)
        (sfsv as? SFSafariViewController)?.dismiss(animated: false, completion: nil)
        
        return true
    }
```

Applicationの履歴階層から、この時点で最前面に表示されているSFSafariViewControllerと、そのすぐ下のViewControllerを取得します。  
次にThanksページのURLをViewControllerに設定します。  
最後に、SFSafariView(Secure WebView)をcloseします。これにより、すぐ下のViewController#viewDidLoadに処理が移ります。  

### Thanksページの読み込み

ViewControllerでは、viewDidLoadの中の下記の処理が起動します。  

```swift
// ViewControllerより抜粋　(見やすくするため、一部加工しています。)

                    :
            let params = webviewParams
            webviewParams = nil
                    :
            } else if(params != nil) {
                webView.evaluateJavaScript("postToThanks('\(params!)')", completionHandler: nil)
                    :
```

WebViewではこの時点で購入ページが表示されており、上記にて下記のJavaScriptが起動してThanksページの読み込みが開始します。  

```html
<!-- nodejs/views/review.ejsより抜粋 (見やすくするため、一部加工しています。) -->

            :
<form id="AmazonpayThanksCall" action="/thanks" method="POST">
    <input type="hidden" id="ShopID" name="ShopID">
    <input type="hidden" id="OrderID" name="OrderID">
    <input type="hidden" id="Status" name="Status">
    <input type="hidden" id="TranDate" name="TranDate">
    <input type="hidden" id="AmazonChargePermissionID" name="AmazonChargePermissionID">
    <input type="hidden" id="CheckString" name="CheckString">
    <input type="hidden" id="ErrCode" name="ErrCode">
    <input type="hidden" id="ErrInfo" name="ErrInfo">
</form>
            :
<script type="text/javascript" charset="utf-8">
            :
    function postToThanks(params) {
        document.getElementById('ShopID').value = getParameter("ShopID", params)
        document.getElementById('OrderID').value = getParameter("OrderID", params)
        document.getElementById('Status').value = getParameter("Status", params)
        document.getElementById('TranDate').value = getParameter("TranDate", params)
        document.getElementById('AmazonChargePermissionID').value = getParameter("AmazonChargePermissionID", params)
        document.getElementById('CheckString').value = getParameter("CheckString", params)
        document.getElementById('ErrCode').value = getParameter("ErrCode", params)
        document.getElementById('ErrInfo').value = getParameter("ErrInfo", params)
        document.getElementById('AmazonpayThanksCall').submit();
    }
            :
</script>
            :

```

Server側では下記が実行されます。

```js
// nodejs/app.jsより抜粋 (見やすくするため、一部加工しています。)

//-------------------
// Thanks Screen
//-------------------
app.post('/thanks', async (req, res) => {
            :
        const order = JSON.parse(req.cookies.session);
        console.log(`OrderID: ${order.id}`);
        console.log(`AmazonpayStart: ${JSON.stringify(req.body, null, 2)}`);

        // Security Check
        const textToHash = `${order.id}${order.access.AccessID}${keyinfo.ShopID}${keyinfo.ShopPass}${req.body.AmazonChargePermissionID}`;
        const hash = crypto.createHash('sha256').update(textToHash).digest('hex');
        console.log(`Hash: ${hash}`);
        if(hash !== req.body.CheckString) throw new Error('CheckStringが一致しません。');

        // Status Check
        if(req.body.Status !== 'AUTH' || req.body.ErrCode) throw new Error(`ステータス不正: ${JSON.stringify(req.body)}`);

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
            :
});
```

GMOPGから渡されたCheckStringを利用してSecurity Checkを行い、GMOPG APIを使って注文確定し、thanks画面を表示しています。  
本サンプルアプリの購入完了までのフローとしては、以上となります。  

## 住所・支払方法変更

<img src="docimg/2025-11-07-17-02-09.png" width="700">  

### 「住所・支払方法変更」とは？
購入ページ(Reviewページ)でユーザは送付先住所・支払方法を確認しますが、このときユーザが変更することができるようにする仕組みとしてbindChangeActionというメソッドが用意されており、本サンプルアプリでもBrowser向けにはこちらを直接使っております。  

```html
<!-- nodejs/views/review.ejsより抜粋 (見やすくするため、一部加工しています。) -->

                        :
                    <div id="changeButton1" class="btn btn-outline-secondary btn-sm">変更</div>
                        :
                    <div id="changeButton2" class="btn btn-outline-secondary btn-sm">変更</div>
                        :
<script type="text/javascript" charset="utf-8">
                        :
    //-------------------------
    // 住所・支払方法変更ボタン
    //-------------------------
                        :
        // Browser
        amazon.Pay.bindChangeAction('#changeButton1', {
            amazonCheckoutSessionId: '<%= amazonCheckoutSessionId %>',
            changeAction: 'changeAddress'
        });
        amazon.Pay.bindChangeAction('#changeButton2', {
            amazonCheckoutSessionId: '<%= amazonCheckoutSessionId %>',
            changeAction: 'changePayment'
        });
                        :
```

このbindChangeActionをパラメタとして指定されたdivノードを押下すると、Amazon Payの住所・支払方法選択ページが開いてユーザはそれぞれを選択し直すことができます。  

この動作をモバイルアプリで実行しようとした場合、購入ページが表示されているWeView上では実行できないため、Secure WebViewを起動してからAmazon Payの住所・支払方法選択ページを開く必要があります。  

### Secure WebView上での住所・支払い方法変更

Secure WebViewを起動するため、まずはハンドラからNativeコードの呼び出しを行います。  

```html
<!-- nodejs/views/review.ejsより抜粋 (見やすくするため、一部加工しています。) -->

                        :
                    <div id="changeButton1" class="btn btn-outline-secondary btn-sm">変更</div>
                        :
                    <div id="changeButton2" class="btn btn-outline-secondary btn-sm">変更</div>
                        :
<script type="text/javascript" charset="utf-8">
                        :
    //-------------------------
    // 住所・支払方法変更ボタン
    //-------------------------
    if(window.androidApp) {
                :
    } else if (window.webkit && webkit.messageHandlers && webkit.messageHandlers.iosApp) {
        // iOS App
        document.getElementById("changeButton1").addEventListener('click', (e) => {
            coverScreen();
            webkit.messageHandlers.iosApp.postMessage({op: 'changeSecureWebview', params: 'action=changeAddress&id=<%= amazonCheckoutSessionId %>'});
        });
        document.getElementById("changeButton2").addEventListener('click', (e) => {
            coverScreen();
            webkit.messageHandlers.iosApp.postMessage({op: 'changeSecureWebview', params: 'action=changePayment&id=<%= amazonCheckoutSessionId %>'});
        });
    } else {
                :
```

住所変更用の「changeButton1」・支払方法変更用の「changeButton2」のそれぞれに対して、ボタン押下時にハンドラを呼び出す用に設定します。  
なお、changeButton1のparamsには「action=changeAddress」、changeButton2のparamsには「action=changePayment」を指定していることにもご注意ください。  

これにより、Nativeコードの下記が呼び出されます。  
```swift
// ViewControllerより抜粋　(見やすくするため、一部加工しています。)
                        :
extension ViewController: WKScriptMessageHandler {
    // JavaScript側からのCallback.
    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        print("ViewController#userContentController")
        switch message.name {
        case "iosApp":
            print("iosApp")
            
            if let data = message.body as? NSDictionary {
                print(data)
                let op = data["op"] as! String?
                switch op! {
                        :
                case "changeSecureWebview":
                    changeSecureWebview(data["params"] as! String)
                        :
                }
            }
                        :
        }
    }
}
```

「changeSecureWebview」は下記です。

```swift
    func changeSecureWebview(_ params: String) {
        print("ViewController#changeSecureWebview")
        let safariView = SFSafariViewController(url: NSURL(string: "https://localhost:3443/static/changeSecureWebview.html?\(params)&secureToken=\(secureToken!)")! as URL)
        present(safariView, animated: true, completion: nil)
    }
```

これにより、Secure WebView上で下記が実行されます。  

```html
<!-- nodejs/static/changeSecureWebview.htmlより抜粋 (見やすくするため、一部加工しています。) -->
                :
<div id="changeButton"></div>
<script type="text/javascript" src="https://static-fe.payments-amazon.com/checkout.js"></script>
<script>
                :
        amazon.Pay.bindChangeAction('#changeButton', {
            amazonCheckoutSessionId: getURLParameter('id', location.search),
            changeAction: getURLParameter('action', location.search)
        });

        setTimeout(() => {
            document.getElementById('changeButton').click();
        }, 0);
                :
</script>
                :
```

bindChangeActionが「changeButton」ノードに対して実行された後、スクリプトで自動的に押下(クリック)されます。  
これにより、Secure WebView上で適切なパラメタで住所・支払方法選択が起動されます。  
※ 実際のコードでは正当な画面遷移であることの確認としてsecureTokenのチェックも行っております。  

住所・支払方法選択後にSecure WebViewからアプリに戻ってThanks画面が表示される処理に関しては通常のフローと同じになります。  

## Amazon側ページ上でのCancel処理

<img src="docimg/2025-11-11-14-39-30.png" width="400">  

Amazon PayではAmazon側の画面上でBuyerがキャンセルできるようになっており、デフォルトでキャンセル後にはAmazon Payボタンが配置されていたページに戻るようになっています。  
しかし、本Mobileアプリの場合にはAmazon Payボタンが配置されているページはWebView上で表示される一方、Amazon側の画面はSecure WebView上で表示されるため、このデフォルの挙動のままでは正しくWebView上のページに戻すことができません。  
正しく動作させるために、下記のように対処します。  

### checkoutCancelUrlの設定

上記「Code GeneratorによるinitCheckoutスクリプトの生成方法」で解説した通り、「Checkout Cancel Url」を指定してScriptを生成したスクリプトでは下記のように checkoutCancelUrlに「https://localhost:3443/static/cancelSecureWebview.html?client=iosApp 」が設定されます。  

```js
// nodejs/views/startSecureWebview.ejsより抜粋 (見やすくするため、一部加工しています。)
                :
    amazon.Pay.initCheckout({
                :
        createCheckoutSessionConfig: {                     
                :
            payloadJSON: '{...:{...,"checkoutCancelUrl":"https://localhost:3443/static/cancelSecureWebview.html?client=iosApp"},...}',
                :
        }
    });
                :
```

この「checkoutCancelUrl」を指定すると、Amazon側の画面上でのBuyerのキャンセルにより、このURLへのリダイレクトが実行されるようになります。  

### CustomURLSchemeでモバイルアプリに戻る
「https://localhost:3443/static/cancelSecureWebview.html?client=iosApp 」にリダイレクトされると下記が実行されます。  

```js
            :
    const client = getURLParameter("client", location.search);
    location.href = client === 'iosApp' 
        ? 'amazonpay-ios-v2://cancel'
        : 'intent://amazon_pay_android_v2#Intent;package=com.example.myapp2;scheme=amazon_pay_android_v2;S.mode=cancel;end;';
            :
```

clientは「iosApp」なので、「amazonpay-ios-v2://cancel」のCustomURLSchemeが起動されます。  
これにより、下記のNativeの処理が起動します。  

```swift
// AppDelegateより抜粋　(見やすくするため、一部加工しています。)

    func application(_ app: UIApplication, open url: URL, options: [UIApplication.OpenURLOptionsKey : Any] = [:]) -> Bool {
        print("Custom URL Scheme!")
        print(url)
        
        // ViewControllerの取得
        let vc:ViewController? = UIApplication.shared.keyWindow?.rootViewController as? ViewController
        // SFSafariViewConrollerの取得(表示されていた場合のみ)
        let sfsv = vc?.presentedViewController

        if(url.host! == "thanks") { // Thanksページ表示
                :
        } else { // Cancel
            // Amazon PayのAuthorizeページ(スピナーページ)上で処理失敗後にCancelされた場合でもCartページに戻れるよう、戻り先URLを指定する.
            vc?.webviewUrl = "/cart"
        }
        
        // SFSafariViewのclose (この後、ViewController#viewDidAppearに処理が移る)
        (sfsv as? SFSafariViewController)?.dismiss(animated: false, completion: nil)
        
        return true
    }
```

Applicationの履歴階層から、この時点で最前面に表示されているSFSafariViewControllerと、そのすぐ下のViewControllerを取得します。  
次にキャンセル時の戻り先となるカートページのURLを設定します。  
最後に、SFSafariView(Secure WebView)をcloseします。これにより、すぐ下のViewController#viewDidLoadに処理が移り、下記が実行されます。  

```swift
// ViewControllerより抜粋　(見やすくするため、一部加工しています。)

            let url = webviewUrl
            webviewUrl = nil
                    :
            if(url != nil) {
                webView.evaluateJavaScript("loadUrl('\(url!)')", completionHandler: nil)
                    :
```

Secure WebView上のAmazon側の画面上でキャンセルが実行されたとき、WebView側はカートページの可能性と購入ページの可能性の両方がありえますが、どちらのケースでも下記のJavaScriptの関数が実装されているため、問題なく起動できます。  

```js
// nodejs/views/cart.ejs, review.ejs のそれぞれより抜粋 (見やすくするため、一部加工しています。)

    function loadUrl(url) {
        location.href = url;
    }
```

これによりWebView上で指定したURLが読み込まれて、Cartページに戻ることができます。  

## その他

### Secure WebView起動時の対処
WebViewからSecure WebView起動処理をJavaScriptで呼び出すとき、下記のように直前で「coverScreen」という、ページ上にスピナーを表示して操作不能にする関数を呼んでいます。  

```html
<!-- nodejs/views/cart.ejsより抜粋　(見やすくするため、一部加工しています。) -->
                :
<div id="white_cover" class="popup-cover" style="display: none;">
    <div class="loader"></div>
</div>
                :
<script type="text/javascript" charset="utf-8">
                :
        node.addEventListener('click', (e) => {
            coverScreen(); // ← ※※※ こちらの処理 ※※※
            if(client === 'androidApp') {
                androidApp.startSecureWebview();
            } else {
                webkit.messageHandlers.iosApp.postMessage({op: 'startSecureWebview'});            
            }
        });
                :
    function coverScreen() {
        document.getElementById('white_cover').style.display = 'flex';
    }

    function uncoverScreen() {
        document.getElementById('white_cover').style.display = 'none';
    }
</script>
                :
```

もしこの関数を呼ばなかった場合、Secure WebViewがCloseされるときの画面は、下記のような動きになります。  
<img src="docimg/nocover-version.gif" width="300">  

WebViewの画面の遷移が終わるまでの間、Secure WebView起動前の画面が表示されるため、不自然に見えてしまう上、WebView上でのページ遷移に時間がかかった場合には遷移前の画面を操作されてしまう危険性もあります。  
Secure WebView起動直前に「coverScreen」を呼び出しておくことで、下記のようにこれを防ぐことができます。  
<img src="docimg/cover-version.gif" width="300">  

なおこのままだと、ユーザがSecure WebViewの左上の「Done」をタップしてWebViewに戻ってきた場合には、ページにスピナーが表示されたままで操作不能になってしまいます。  
そこでその場合には、ViewController#viewDidLoadの下記コードにて「uncoverScreen」を呼んで、スピナーを非表示にして元に戻しています
。  

```swift
// ViewControllerより抜粋　(見やすくするため、一部加工しています。)
                    :
            if(url != nil) {
                    :
            } else if(params != nil) {
                    :
            } else {
                webView.evaluateJavaScript("if(window.uncoverScreen) {uncoverScreen();}", completionHandler: nil)
            }
```

本サンプルでは「coverScreen」はスピナーを表示していますが、こちらは各モバイルアプリのデザインや方針などに応じて、より自然に見えるものを表示しても良いでしょう。  

