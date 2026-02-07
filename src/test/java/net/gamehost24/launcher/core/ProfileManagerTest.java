package net.gamehost24.launcher.core;

import net.gamehost24.launcher.model.Profile;
import org.junit.jupiter.api.*;
import static org.junit.jupiter.api.Assertions.*;

import java.io.File;
import java.nio.file.Files;
import java.nio.file.Path;

/**
 * Unit tests for ProfileManager
 */
@TestMethodOrder(MethodOrderer.OrderAnnotation.class)
class ProfileManagerTest {

    private static ProfileManager profileManager;
    private static final String TEST_PROFILE_NAME = "TestProfile_" + System.currentTimeMillis();

    @BeforeAll
    static void setUp() {
        profileManager = new ProfileManager();
    }

    @Test
    @Order(1)
    @DisplayName("Should create a new profile")
    void testCreateProfile() {
        Profile profile = new Profile(
            TEST_PROFILE_NAME,
            "1.21.1",
            "fabric",
            4096,
            "",
            "",
            "Box"
        );
        profile.setLoaderVersion("0.15.11");

        int initialCount = profileManager.getProfiles().size();
        profileManager.addProfile(profile);

        assertEquals(initialCount + 1, profileManager.getProfiles().size());
        
        Profile retrieved = profileManager.getProfile(TEST_PROFILE_NAME);
        assertNotNull(retrieved);
        assertEquals(TEST_PROFILE_NAME, retrieved.getName());
        assertEquals("1.21.1", retrieved.getVersion());
        assertEquals("fabric", retrieved.getModLoader());
        assertEquals("0.15.11", retrieved.getLoaderVersion());
    }

    @Test
    @Order(2)
    @DisplayName("Should retrieve profile by name")
    void testGetProfile() {
        Profile profile = profileManager.getProfile(TEST_PROFILE_NAME);
        assertNotNull(profile);
        assertEquals(TEST_PROFILE_NAME, profile.getName());
    }

    @Test
    @Order(3)
    @DisplayName("Should return null for non-existent profile")
    void testGetNonExistentProfile() {
        Profile profile = profileManager.getProfile("NonExistentProfile_12345");
        assertNull(profile);
    }

    @Test
    @Order(4)
    @DisplayName("Should update profile properties")
    void testUpdateProfile() {
        Profile profile = profileManager.getProfile(TEST_PROFILE_NAME);
        assertNotNull(profile);

        profile.setRamMb(8192);
        profile.setVersion("1.20.4");
        profileManager.saveProfiles();

        // Reload and verify
        profileManager.loadProfiles();
        Profile updated = profileManager.getProfile(TEST_PROFILE_NAME);
        
        assertNotNull(updated);
        assertEquals(8192, updated.getRamMb());
        assertEquals("1.20.4", updated.getVersion());
    }

    @Test
    @Order(5)
    @DisplayName("Should list all profiles")
    void testListProfiles() {
        var profiles = profileManager.getProfiles();
        assertNotNull(profiles);
        assertTrue(profiles.size() > 0);
        assertTrue(profiles.stream().anyMatch(p -> p.getName().equals(TEST_PROFILE_NAME)));
    }

    @Test
    @Order(6)
    @DisplayName("Should remove profile")
    void testRemoveProfile() {
        Profile profile = profileManager.getProfile(TEST_PROFILE_NAME);
        assertNotNull(profile);

        int countBefore = profileManager.getProfiles().size();
        profileManager.removeProfile(profile);
        
        assertEquals(countBefore - 1, profileManager.getProfiles().size());
        assertNull(profileManager.getProfile(TEST_PROFILE_NAME));
    }

    @Test
    @DisplayName("Should handle profile with special characters in name")
    void testSpecialCharacterProfileName() {
        String specialName = "Test Profile (Special) - 日本語";
        Profile profile = new Profile(
            specialName,
            "1.21.1",
            "vanilla",
            4096,
            "",
            "",
            "Box"
        );

        profileManager.addProfile(profile);
        
        Profile retrieved = profileManager.getProfile(specialName);
        assertNotNull(retrieved);
        assertEquals(specialName, retrieved.getName());

        // Cleanup
        profileManager.removeProfile(retrieved);
    }

    @Test
    @DisplayName("Should persist profiles across reload")
    void testPersistence() {
        String persistName = "PersistTest_" + System.currentTimeMillis();
        Profile profile = new Profile(
            persistName,
            "1.21.1",
            "forge",
            6144,
            "",
            "",
            "Sword"
        );

        profileManager.addProfile(profile);
        profileManager.saveProfiles();

        // Create new instance and load
        ProfileManager newManager = new ProfileManager();
        Profile loaded = newManager.getProfile(persistName);

        assertNotNull(loaded);
        assertEquals(persistName, loaded.getName());
        assertEquals("forge", loaded.getModLoader());
        assertEquals(6144, loaded.getRamMb());

        // Cleanup
        newManager.removeProfile(loaded);
    }
}
