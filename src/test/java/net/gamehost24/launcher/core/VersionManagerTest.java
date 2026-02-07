package net.gamehost24.launcher.core;

import org.junit.jupiter.api.*;
import org.to2mbn.jmccc.mcdownloader.download.concurrent.DownloadCallback;
import static org.junit.jupiter.api.Assertions.*;

import java.util.List;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.TimeUnit;

/**
 * Unit tests for VersionManager
 */
class VersionManagerTest {

    private static VersionManager versionManager;

    @BeforeAll
    static void setUp() {
        versionManager = new VersionManager();
    }

    @Test
    @DisplayName("Should fetch Minecraft versions from Mojang API")
    void testFetchGameVersions() throws Exception {
        CompletableFuture<List<String>> future = new CompletableFuture<>();

        versionManager.fetchGameVersions(new DownloadCallback<List<String>>() {
            @Override
            public void done(List<String> result) {
                future.complete(result);
            }

            @Override
            public void failed(Throwable e) {
                future.completeExceptionally(e);
            }

            @Override
            public void cancelled() {
                future.cancel(true);
            }

            @Override
            public void updateProgress(long done, long total) {}

            @Override
            public void retry(Throwable e, int current, int max) {}
        });

        List<String> versions = future.get(30, TimeUnit.SECONDS);
        
        assertNotNull(versions);
        assertTrue(versions.size() > 0, "Should have at least one version");
        
        // Check for known versions
        assertTrue(versions.contains("1.21.1") || versions.contains("1.21") || versions.contains("1.20.6"),
            "Should contain recent Minecraft versions");
        
        // Versions should be release versions (no snapshots by default)
        assertFalse(versions.stream().anyMatch(v -> v.contains("snapshot") || v.contains("pre")),
            "Should not contain snapshot versions");
    }

    @Test
    @DisplayName("Should fetch Fabric loader versions")
    void testFetchFabricVersions() throws Exception {
        CompletableFuture<List<String>> future = new CompletableFuture<>();

        versionManager.fetchFabricLoaderVersions("1.21.1", new DownloadCallback<List<String>>() {
            @Override
            public void done(List<String> result) {
                future.complete(result);
            }

            @Override
            public void failed(Throwable e) {
                future.completeExceptionally(e);
            }

            @Override
            public void cancelled() {
                future.cancel(true);
            }

            @Override
            public void updateProgress(long done, long total) {}

            @Override
            public void retry(Throwable e, int current, int max) {}
        });

        List<String> loaders = future.get(30, TimeUnit.SECONDS);
        
        assertNotNull(loaders);
        assertTrue(loaders.size() > 0, "Should have Fabric loader versions");
        
        // Fabric versions follow semver pattern
        assertTrue(loaders.get(0).matches("\\d+\\.\\d+\\.\\d+"),
            "Fabric loader version should follow semver pattern");
    }

    @Test
    @DisplayName("Should fetch Forge versions")
    void testFetchForgeVersions() throws Exception {
        CompletableFuture<List<String>> future = new CompletableFuture<>();

        versionManager.fetchForgeVersions("1.20.1", new DownloadCallback<List<String>>() {
            @Override
            public void done(List<String> result) {
                future.complete(result);
            }

            @Override
            public void failed(Throwable e) {
                future.completeExceptionally(e);
            }

            @Override
            public void cancelled() {
                future.cancel(true);
            }

            @Override
            public void updateProgress(long done, long total) {}

            @Override
            public void retry(Throwable e, int current, int max) {}
        });

        List<String> forgeVersions = future.get(60, TimeUnit.SECONDS);
        
        assertNotNull(forgeVersions);
        // Forge may not have versions for all MC versions
        if (forgeVersions.size() > 0) {
            // Forge versions contain numbers
            assertTrue(forgeVersions.get(0).matches(".*\\d+.*"),
                "Forge version should contain numbers");
        }
    }

    @Test
    @DisplayName("Should return empty list for unsupported MC version")
    void testFetchFabricForOldVersion() throws Exception {
        CompletableFuture<List<String>> future = new CompletableFuture<>();

        // Very old version that Fabric doesn't support
        versionManager.fetchFabricLoaderVersions("1.0", new DownloadCallback<List<String>>() {
            @Override
            public void done(List<String> result) {
                future.complete(result);
            }

            @Override
            public void failed(Throwable e) {
                // Expected for unsupported versions
                future.complete(List.of());
            }

            @Override
            public void cancelled() {
                future.cancel(true);
            }

            @Override
            public void updateProgress(long done, long total) {}

            @Override
            public void retry(Throwable e, int current, int max) {}
        });

        List<String> loaders = future.get(30, TimeUnit.SECONDS);
        
        assertNotNull(loaders);
        // Should be empty or very few for unsupported version
        assertTrue(loaders.size() <= 1, "Old MC version should have no/few Fabric loaders");
    }
}
