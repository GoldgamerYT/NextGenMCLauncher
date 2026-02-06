package net.gamehost24.launcher.ui.fx;

import javafx.application.Application;
import javafx.concurrent.Worker;
import javafx.scene.Scene;
import javafx.scene.layout.StackPane;
import javafx.scene.paint.Color;
import javafx.scene.web.WebEngine;
import javafx.scene.web.WebView;
import javafx.stage.Stage;
import javafx.stage.StageStyle;
import netscape.javascript.JSObject;

import java.net.URL;

public class LauncherFX extends Application {

    public WebView webView;
    private JSBridge bridge;

    @Override
    public void start(Stage stage) {
        webView = new WebView();
        WebEngine engine = webView.getEngine();
        bridge = new JSBridge(this);

        // Styling
        webView.setContextMenuEnabled(false);

        // Bridge setup
        engine.getLoadWorker().stateProperty().addListener((obs, oldState, newState) -> {
            if (newState == Worker.State.SUCCEEDED) {
                JSObject win = (JSObject) engine.executeScript("window");
                win.setMember("bridge", bridge);
                // Initialize UI
                engine.executeScript("if (typeof init === 'function') init();");
            }
        });

        // Fix "User data directory in use" by using a unique temp dir if needed, or
        // just specific one
        try {
            java.io.File userData = new java.io.File(System.getProperty("java.io.tmpdir"),
                    "mclauncher-webview-" + System.currentTimeMillis());
            engine.setUserDataDirectory(userData);
        } catch (Exception e) {
            System.err.println("Failed to set webview user data: " + e.getMessage());
        }

        // Log errors
        engine.setOnError(event -> System.err.println("Web Error: " + event.getMessage()));
        engine.setOnAlert(event -> System.out.println("Web Alert: " + event.getData()));

        // Load content
        URL url = getClass().getResource("/web/index.html");
        if (url != null) {
            engine.load(url.toExternalForm());
        } else {
            System.err.println("Could not find /web/index.html");
        }

        // Custom Title Bar Dragging Logic
        // We place a transparent pane on top of the WebView at the top area
        javafx.scene.layout.Pane dragRegion = new javafx.scene.layout.Pane();
        dragRegion.setPrefHeight(30); // Height of title bar matches CSS
        dragRegion.setMaxHeight(30);
        dragRegion.setStyle("-fx-background-color: rgba(0,0,0,0.01);"); // Almost transparent to capture events
        StackPane.setAlignment(dragRegion, javafx.geometry.Pos.TOP_CENTER);

        // Window Drag Variables (Wrappers to be effectively final)
        final double[] xOffset = { 0 };
        final double[] yOffset = { 0 };

        dragRegion.setOnMousePressed(event -> {
            xOffset[0] = event.getSceneX();
            yOffset[0] = event.getSceneY();
        });

        dragRegion.setOnMouseDragged(event -> {
            stage.setX(event.getScreenX() - xOffset[0]);
            stage.setY(event.getScreenY() - yOffset[0]);
        });

        StackPane root = new StackPane(webView, dragRegion);
        Scene scene = new Scene(root, 1100, 750);

        // To support transparent corners if desired, stage should be transparent
        // But for black bar, standard undecorated is fine.
        stage.initStyle(StageStyle.UNDECORATED);
        stage.setTitle("NextGen MC Launcher");
        stage.setScene(scene);
        stage.show();
    }

    public static void main(String[] args) {
        launch(args);
    }
}
