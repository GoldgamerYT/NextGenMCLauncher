package net.gamehost24.launcher.core;

import org.to2mbn.jmccc.mcdownloader.MinecraftDownloader;
import org.to2mbn.jmccc.mcdownloader.MinecraftDownloaderBuilder;
import org.to2mbn.jmccc.mcdownloader.download.concurrent.CallbackAdapter;
import org.to2mbn.jmccc.mcdownloader.download.concurrent.DownloadCallback;
import org.to2mbn.jmccc.mcdownloader.provider.fabric.FabricDownloadProvider;
import org.to2mbn.jmccc.mcdownloader.provider.fabric.FabricVersionList;
import org.to2mbn.jmccc.mcdownloader.RemoteVersionList;
import org.to2mbn.jmccc.option.MinecraftDirectory;
import org.to2mbn.jmccc.version.Version;

import java.io.File;
import java.util.ArrayList;
import java.util.List;
import java.io.InputStreamReader;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.Collections;

import com.google.gson.Gson;
import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;

public class VersionManager {

    private MinecraftDownloader downloader;

    public VersionManager() {
        FabricDownloadProvider fabricProvider = new FabricDownloadProvider();
        // Use our custom provider to handle Forge installation correctly
        org.to2mbn.jmccc.mcdownloader.provider.forge.CustomForgeDownloadProvider forgeProvider = new org.to2mbn.jmccc.mcdownloader.provider.forge.CustomForgeDownloadProvider();
        this.downloader = MinecraftDownloaderBuilder.create()
                .providerChain(org.to2mbn.jmccc.mcdownloader.provider.DownloadProviderChain.create()
                        .addProvider(fabricProvider)
                        .addProvider(forgeProvider))
                .build();
    }

    // --- Game Versions (Manual Fetch) ---
    public void fetchGameVersions(DownloadCallback<java.util.List<String>> callback) {
        new Thread(() -> {
            try {
                System.out.println("VersionManager: Fetching from Mojang...");
                URL url = new URL("https://piston-meta.mojang.com/mc/game/version_manifest_v2.json");
                HttpURLConnection conn = (HttpURLConnection) url.openConnection();
                conn.setRequestMethod("GET");
                conn.setConnectTimeout(5000);
                conn.setReadTimeout(5000);

                if (conn.getResponseCode() == 200) {
                    try (InputStreamReader reader = new InputStreamReader(conn.getInputStream())) {
                        JsonObject root = JsonParser.parseReader(reader).getAsJsonObject();
                        JsonArray versions = root.getAsJsonArray("versions");

                        List<String> gameVersions = new ArrayList<>();
                        for (JsonElement el : versions) {
                            JsonObject v = el.getAsJsonObject();
                            if ("release".equalsIgnoreCase(v.get("type").getAsString())) {
                                gameVersions.add(v.get("id").getAsString());
                            }
                        }

                        System.out.println("VersionManager: Fetched " + gameVersions.size() + " versions.");
                        callback.done(gameVersions);
                    }
                } else {
                    System.err.println("VersionManager: HTTP " + conn.getResponseCode());
                    fetchGameVersionsJMCCC(callback);
                }
            } catch (Exception e) {
                e.printStackTrace();
                fetchGameVersionsJMCCC(callback);
            }
        }).start();
    }

    private void fetchGameVersionsJMCCC(DownloadCallback<java.util.List<String>> callback) {
        System.out.println("VersionManager: Fallback to JMCCC");
        downloader.fetchRemoteVersionList(new CallbackAdapter<RemoteVersionList>() {
            @Override
            public void done(RemoteVersionList result) {
                List<String> versions = new ArrayList<>();
                if (result != null && result.getVersions() != null) {
                    List<org.to2mbn.jmccc.mcdownloader.RemoteVersion> sorted = new ArrayList<>(
                            result.getVersions().values());
                    // Sort by release date descending
                    sorted.sort((v1, v2) -> {
                        if (v1.getReleaseTime() != null && v2.getReleaseTime() != null) {
                            return v2.getReleaseTime().compareTo(v1.getReleaseTime());
                        }
                        return 0;
                    });

                    for (org.to2mbn.jmccc.mcdownloader.RemoteVersion v : sorted) {
                        if ("release".equals(v.getType())) {
                            versions.add(v.getVersion());
                        }
                    }
                }
                callback.done(versions);
            }

            @Override
            public void failed(Throwable e) {
                callback.failed(e);
            }
        });
    }

    // --- Legacy Support ---
    public void fetchVersions(DownloadCallback<RemoteVersionList> callback) {
        downloader.fetchRemoteVersionList(new CallbackAdapter<RemoteVersionList>() {
            @Override
            public void done(RemoteVersionList result) {
                callback.done(result);
            }

            @Override
            public void failed(Throwable e) {
                callback.failed(e);
            }

            @Override
            public void cancelled() {
                callback.cancelled();
            }

            @Override
            public void updateProgress(long done, long total) {
            }

            @Override
            public void retry(Throwable e, int current, int max) {
            }
        });
    }

    // --- Mod Loaders ---

    public void resolveFabricVersion(String mcVersion, DownloadCallback<String> callback) {
        FabricDownloadProvider provider = new FabricDownloadProvider();
        downloader.download(provider.fabricVersionList(), new CallbackAdapter<FabricVersionList>() {
            @Override
            public void done(FabricVersionList result) {
                try {
                    org.to2mbn.jmccc.mcdownloader.provider.fabric.FabricVersion v = result.getLatest(mcVersion);
                    if (v != null) {
                        callback.done(v.getVersionName());
                    } else {
                        callback.failed(new Exception("No Fabric version found for " + mcVersion));
                    }
                } catch (Exception e) {
                    callback.failed(e);
                }
            }

            @Override
            public void failed(Throwable e) {
                callback.failed(e);
            }
        });
    }

    public void fetchFabricLoaderVersions(String mcVersion, DownloadCallback<List<String>> callback) {
        // Direct fetch from meta.fabricmc.net
        String urlDir = "https://meta.fabricmc.net/v2/versions/loader/" + mcVersion;
        new Thread(() -> {
            try {
                URL url = new URL(urlDir);
                HttpURLConnection conn = (HttpURLConnection) url.openConnection();
                conn.setRequestMethod("GET");
                if (conn.getResponseCode() == 200) {
                    try (InputStreamReader reader = new InputStreamReader(conn.getInputStream())) {
                        JsonArray array = JsonParser.parseReader(reader).getAsJsonArray();
                        List<String> loaders = new ArrayList<>();
                        for (JsonElement el : array) {
                            loaders.add(
                                    el.getAsJsonObject().get("loader").getAsJsonObject().get("version").getAsString());
                        }
                        callback.done(loaders);
                    }
                } else {
                    callback.failed(new Exception("HTTP " + conn.getResponseCode()));
                }
            } catch (Exception e) {
                callback.failed(e);
            }
        }).start();
    }

    public void fetchForgeVersions(String mcVersion, DownloadCallback<List<String>> callback) {
        // JMCCC Forge Helper
        org.to2mbn.jmccc.mcdownloader.provider.forge.ForgeDownloadProvider provider = new org.to2mbn.jmccc.mcdownloader.provider.forge.ForgeDownloadProvider();
        downloader.download(provider.forgeVersionList(),
                new CallbackAdapter<org.to2mbn.jmccc.mcdownloader.provider.forge.ForgeVersionList>() {
                    @Override
                    public void done(org.to2mbn.jmccc.mcdownloader.provider.forge.ForgeVersionList result) {
                        try {
                            // result.getVersions(mcVersion) returns sorted list usually.
                            java.util.List<org.to2mbn.jmccc.mcdownloader.provider.forge.ForgeVersion> forges = result
                                    .getVersions(mcVersion);
                            List<String> versions = new ArrayList<>();
                            if (forges != null) {
                                for (org.to2mbn.jmccc.mcdownloader.provider.forge.ForgeVersion v : forges) {
                                    versions.add(v.getForgeVersion());
                                }
                            }
                            // Reverse to get latest first if JMCCC returns ascending
                            Collections.reverse(versions);
                            callback.done(versions);
                        } catch (Exception e) {
                            callback.failed(e);
                        }
                    }

                    @Override
                    public void failed(Throwable e) {
                        callback.failed(e);
                    }
                });
    }

    public void fetchQuiltLoaderVersions(String mcVersion, DownloadCallback<List<String>> callback) {
        String urlStr = "https://meta.quiltmc.org/v3/versions/loader/" + mcVersion;
        new Thread(() -> {
            try {
                URL url = new URL(urlStr);
                HttpURLConnection conn = (HttpURLConnection) url.openConnection();
                conn.setRequestMethod("GET");
                conn.setConnectTimeout(8000);
                conn.setReadTimeout(8000);
                if (conn.getResponseCode() == 200) {
                    try (InputStreamReader reader = new InputStreamReader(conn.getInputStream())) {
                        JsonArray array = JsonParser.parseReader(reader).getAsJsonArray();
                        List<String> versions = new ArrayList<>();
                        for (JsonElement el : array) {
                            JsonObject loader = el.getAsJsonObject().getAsJsonObject("loader");
                            if (loader != null && loader.has("version")) {
                                versions.add(loader.get("version").getAsString());
                            }
                        }
                        callback.done(versions);
                    }
                } else {
                    callback.done(Collections.emptyList());
                }
            } catch (Exception e) {
                callback.done(Collections.emptyList());
            }
        }).start();
    }

    public void fetchLiteLoaderVersions(String mcVersion, DownloadCallback<List<String>> callback) {
        String urlStr = "https://dl.liteloader.com/versions/versions.json";
        new Thread(() -> {
            try {
                URL url = new URL(urlStr);
                HttpURLConnection conn = (HttpURLConnection) url.openConnection();
                conn.setRequestMethod("GET");
                conn.setConnectTimeout(8000);
                conn.setReadTimeout(8000);
                List<String> versions = new ArrayList<>();
                if (conn.getResponseCode() == 200) {
                    try (InputStreamReader reader = new InputStreamReader(conn.getInputStream())) {
                        JsonObject root = JsonParser.parseReader(reader).getAsJsonObject();
                        // versions -> mcVersion -> repo -> stream -> latest/version
                        JsonObject versionsObj = root.has("versions") ? root.getAsJsonObject("versions") : null;
                        if (versionsObj != null && versionsObj.has(mcVersion)) {
                            JsonObject mcObj = versionsObj.getAsJsonObject(mcVersion);
                            JsonObject repo = mcObj.has("repo") ? mcObj.getAsJsonObject("repo") : null;
                            if (repo != null) {
                                JsonObject stream = repo.has("stream") ? repo.getAsJsonObject("stream") : null;
                                if (stream != null && stream.has("latest")) {
                                    versions.add(stream.get("latest").getAsString());
                                }
                            }
                        }
                    }
                }
                callback.done(versions);
            } catch (Exception e) {
                callback.done(Collections.emptyList());
            }
        }).start();
    }

    public void fetchNeoForgeVersions(String mcVersion, DownloadCallback<List<String>> callback) {
        new Thread(() -> {
            try {
                URL url = new URL("https://maven.neoforged.net/releases/net/neoforged/neoforge/maven-metadata.xml");
                HttpURLConnection conn = (HttpURLConnection) url.openConnection();
                conn.setConnectTimeout(8000);
                conn.setReadTimeout(8000);
                if (conn.getResponseCode() != 200) { callback.done(Collections.emptyList()); return; }

                StringBuilder sb = new StringBuilder();
                try (InputStreamReader r = new InputStreamReader(conn.getInputStream())) {
                    char[] buf = new char[16384];
                    int n;
                    while ((n = r.read(buf)) != -1) sb.append(buf, 0, n);
                }
                String xml = sb.toString();

                // Build version prefix: "1.21.1" → "21.1.", "1.20.4" → "20.4."
                String prefix = null;
                java.util.regex.Matcher mv = java.util.regex.Pattern
                    .compile("1\\.(\\d+)(?:\\.(\\d+))?").matcher(mcVersion);
                if (mv.find()) {
                    int minor = Integer.parseInt(mv.group(1));
                    int patch = mv.group(2) != null ? Integer.parseInt(mv.group(2)) : 0;
                    prefix = minor + "." + patch + ".";
                }

                List<String> versions = new ArrayList<>();
                java.util.regex.Matcher m = java.util.regex.Pattern
                    .compile("<version>([^<]+)</version>").matcher(xml);
                final String pfx = prefix;
                while (m.find()) {
                    String v = m.group(1).trim();
                    if (pfx != null && v.startsWith(pfx) && !v.contains("beta")) {
                        versions.add(v);
                    }
                }
                Collections.reverse(versions);
                callback.done(versions);
            } catch (Exception e) {
                callback.failed(e);
            }
        }).start();
    }

    public void downloadVersion(String version, File gameDir, DownloadCallback<Version> callback) {
        MinecraftDirectory mcDir = new MinecraftDirectory(gameDir);
        downloader.downloadIncrementally(mcDir, version, new CallbackAdapter<Version>() {
            @Override
            public void done(Version result) {
                callback.done(result);
            }

            @Override
            public void failed(Throwable e) {
                callback.failed(e);
            }

            @Override
            public void updateProgress(long done, long total) {
                callback.updateProgress(done, total);
            }
        });
    }
}
