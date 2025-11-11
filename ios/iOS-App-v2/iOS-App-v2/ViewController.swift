//
//  ViewController.swift
//  iOS-App-v2
//
//  Created by 内海徹生 on 2020/05/19.
//  Copyright © 2020 内海徹生. All rights reserved.
//

import UIKit
import WebKit
import SafariServices

class ViewController: UIViewController {
    
    var secureToken: String?
    var webviewUrl: String?
    var webviewParams: String?

    var webView: WKWebView!
    
    override func viewDidAppear(_ animated: Bool) {
        super.viewDidAppear(animated)
        print("ViewController#viewDidAppear")

        if webView == nil {
            
            print("start to generate webView")

            // WebViewの画面サイズの設定
            var webViewPadding: CGFloat = 0
            if #available(iOS 11.0, *) {
                let window = UIApplication.shared.keyWindow
                webViewPadding = window!.safeAreaInsets.top
            }
            let webViewHeight = view.frame.size.height - webViewPadding
            let rect = CGRect(x: 0, y: webViewPadding, width: view.frame.size.width, height: webViewHeight)
            
            // JavaScript側からのCallback受付の設定
            let userContentController = WKUserContentController()
            userContentController.add(self, name: "iosApp")
            let webConfig = WKWebViewConfiguration();
            webConfig.userContentController = userContentController

            // JavaScript側のconsole.logを受ける - (1)
//            userContentController.add(self, name: "logging")
//            let _override = WKUserScript(source: "var console = { log: function(msg){window.webkit.messageHandlers.logging.postMessage(msg) }};", injectionTime: .atDocumentStart, forMainFrameOnly: true)
//            userContentController.addUserScript(_override)
            
            // WebViewの生成、cartページの読み込み
            webView = WKWebView(frame: rect, configuration: webConfig)
            let webUrl = URL(string: "http://localhost:3080/cart")!
            let myRequest = URLRequest(url: webUrl)
            webView.load(myRequest)
            
            // 生成したWebViewの画面への追加
            self.view.addSubview(webView)
            
            print("finished generating webView")
        } else {
            let url = webviewUrl
            webviewUrl = nil
            let params = webviewParams
            webviewParams = nil
            if(url != nil) {
                webView.evaluateJavaScript("loadUrl('\(url!)')", completionHandler: nil)
            } else if(params != nil) {
                webView.evaluateJavaScript("postToThanks('\(params!)')", completionHandler: nil)
            } else {
                webView.evaluateJavaScript("if(window.uncoverScreen) {uncoverScreen();}", completionHandler: nil)
            }
        }
    }
    
    func startSecureWebview() {
        print("ViewController#startSecureWebview")
        
        secureToken = UUID().uuidString.lowercased()
        let safariView = SFSafariViewController(url: NSURL(string: "https://localhost:3443/startSecureWebview?client=iosApp&secureToken=\(secureToken!)")! as URL)
        present(safariView, animated: true, completion: nil)
    }
    
    func resumeSecureWebview(_ params: String) {
        print("ViewController#resumeSecureWebview")
        let safariView = SFSafariViewController(url: NSURL(string: "https://localhost:3443/static/resumeSecureWebview.html?\(params)&secureToken=\(secureToken!)")! as URL)
        present(safariView, animated: true, completion: nil)
    }
    
    func changeSecureWebview(_ params: String) {
        print("ViewController#changeSecureWebview")
        let safariView = SFSafariViewController(url: NSURL(string: "https://localhost:3443/static/changeSecureWebview.html?\(params)&secureToken=\(secureToken!)")! as URL)
        present(safariView, animated: true, completion: nil)
    }
}

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
                case "resumeSecureWebview":
                    resumeSecureWebview(data["params"] as! String)
                case "changeSecureWebview":
                    changeSecureWebview(data["params"] as! String)
                default:
                    return
                }
            }
//        case "logging": // JavaScript側のconsole.logを受ける - (2)
//            print("WebView: \(message.body) ")
        default:
            return
        }
    }
}

