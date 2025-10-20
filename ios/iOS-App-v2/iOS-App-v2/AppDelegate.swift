//
//  AppDelegate.swift
//  iOS-App-v2
//
//  Created by 内海徹生 on 2020/05/19.
//  Copyright © 2020 内海徹生. All rights reserved.
//

import UIKit
import SafariServices

@UIApplicationMain
class AppDelegate: UIResponder, UIApplicationDelegate {
    
    var window: UIWindow?
    
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
            
            if (vc?.token! == urlParams["token"]!) { // tokenの一致判定
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
        } else { // Thanksページ表示
            // Amazon PayのAuthorizeページ(スピナーページ)上で処理失敗後にCancelされた場合でもCartページに戻れるよう、戻り先URLを指定する.
            vc?.webviewUrl = "/cart"
        }
        
        // SFSafariViewのclose (この後、ViewController#viewDidAppearに処理が移る)
        (sfsv as? SFSafariViewController)?.dismiss(animated: false, completion: nil)
        
        return true
    }
    
    func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
        // Override point for customization after application launch.
        return true
    }
}
