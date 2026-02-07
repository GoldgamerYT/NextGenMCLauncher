package net.gamehost24.launcher.core;

import org.junit.jupiter.api.*;
import static org.junit.jupiter.api.Assertions.*;

/**
 * Unit tests for JavaManager
 */
class JavaManagerTest {

    private JavaManager javaManager;

    @BeforeEach
    void setUp() {
        javaManager = new JavaManager();
    }

    @Test
    @DisplayName("Should recommend Java 21 for MC 1.21+")
    void testJava21For121() {
        assertEquals(21, javaManager.getRecommendedJavaVersion("1.21"));
        assertEquals(21, javaManager.getRecommendedJavaVersion("1.21.1"));
        assertEquals(21, javaManager.getRecommendedJavaVersion("1.21.11"));
    }

    @Test
    @DisplayName("Should recommend Java 21 for MC 1.20.5+")
    void testJava21For1205() {
        assertEquals(21, javaManager.getRecommendedJavaVersion("1.20.5"));
        assertEquals(21, javaManager.getRecommendedJavaVersion("1.20.6"));
    }

    @Test
    @DisplayName("Should recommend Java 17 for MC 1.18-1.20.4")
    void testJava17ForModern() {
        assertEquals(17, javaManager.getRecommendedJavaVersion("1.20.4"));
        assertEquals(17, javaManager.getRecommendedJavaVersion("1.20.1"));
        assertEquals(17, javaManager.getRecommendedJavaVersion("1.20"));
        assertEquals(17, javaManager.getRecommendedJavaVersion("1.19.4"));
        assertEquals(17, javaManager.getRecommendedJavaVersion("1.18"));
        assertEquals(17, javaManager.getRecommendedJavaVersion("1.18.2"));
    }

    @Test
    @DisplayName("Should recommend Java 17 for MC 1.17")
    void testJava17For117() {
        assertEquals(17, javaManager.getRecommendedJavaVersion("1.17"));
        assertEquals(17, javaManager.getRecommendedJavaVersion("1.17.1"));
    }

    @Test
    @DisplayName("Should recommend Java 8 for MC 1.16 and older")
    void testJava8ForLegacy() {
        assertEquals(8, javaManager.getRecommendedJavaVersion("1.16.5"));
        assertEquals(8, javaManager.getRecommendedJavaVersion("1.16"));
        assertEquals(8, javaManager.getRecommendedJavaVersion("1.12.2"));
        assertEquals(8, javaManager.getRecommendedJavaVersion("1.8.9"));
        assertEquals(8, javaManager.getRecommendedJavaVersion("1.7.10"));
    }

    @Test
    @DisplayName("Should handle null version gracefully")
    void testNullVersion() {
        assertEquals(8, javaManager.getRecommendedJavaVersion(null));
    }

    @Test
    @DisplayName("Should handle invalid version gracefully")
    void testInvalidVersion() {
        assertEquals(8, javaManager.getRecommendedJavaVersion("invalid"));
        assertEquals(8, javaManager.getRecommendedJavaVersion(""));
        assertEquals(8, javaManager.getRecommendedJavaVersion("not-a-version"));
    }

    @Test
    @DisplayName("Should handle Fabric version strings")
    void testFabricVersionString() {
        // Sometimes version strings include loader info
        assertEquals(21, javaManager.getRecommendedJavaVersion("fabric-loader-0.15.11-1.21.1"));
    }

    @Test
    @DisplayName("Should handle Forge version strings")
    void testForgeVersionString() {
        assertEquals(17, javaManager.getRecommendedJavaVersion("1.20.1-forge-47.2.0"));
    }

    // Note: The following test is marked as Disabled because it downloads Java
    // which takes time and network resources. Enable for integration testing.
    @Test
    @Disabled("Downloads Java - enable for integration testing")
    @DisplayName("Should download and provide Java path")
    void testGetJavaPath() throws Exception {
        // This test actually downloads Java if not present
        java.io.File javaPath = javaManager.getJavaPath(17);
        
        assertNotNull(javaPath);
        assertTrue(javaPath.exists(), "Java executable should exist");
        assertTrue(javaPath.getName().contains("java"), "Should be java executable");
    }
}
