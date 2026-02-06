package net.gamehost24.launcher.ui;

import com.formdev.flatlaf.FlatDarkLaf;
import net.gamehost24.launcher.core.LauncherEngine;
import net.gamehost24.launcher.core.ProfileManager;
import net.gamehost24.launcher.model.Profile;

import javax.swing.*;
import java.awt.*;
import java.io.File;
import java.util.List;

public class MainFrame extends JFrame {

    private ProfileManager profileManager;
    private LauncherEngine launcherEngine;
    private net.gamehost24.launcher.core.VersionManager versionManager;
    private JPanel profilesPanel;
    private Profile selectedProfile;

    private JTextArea consoleArea;

    public MainFrame() {
        profileManager = new ProfileManager();
        launcherEngine = new LauncherEngine();
        versionManager = new net.gamehost24.launcher.core.VersionManager();

        setTitle("NextGen MC Launcher");
        setSize(1000, 700);
        setDefaultCloseOperation(JFrame.EXIT_ON_CLOSE);
        setLocationRelativeTo(null);

        initComponents();
        loadProfiles();
    }

    private void initComponents() {
        JPanel mainPanel = new JPanel(new BorderLayout(10, 10));
        mainPanel.setBorder(BorderFactory.createEmptyBorder(20, 20, 20, 20));

        // Top: Title and Add Button
        JPanel topPanel = new JPanel(new BorderLayout());
        JLabel titleLabel = new JLabel("My Profiles");
        titleLabel.setFont(new Font("Segoe UI", Font.BOLD, 28));
        topPanel.add(titleLabel, BorderLayout.WEST);

        JButton addProfileBtn = new JButton("Add Profile");
        addProfileBtn.setFont(new Font("Segoe UI", Font.PLAIN, 14));
        addProfileBtn.addActionListener(e -> addProfile());
        topPanel.add(addProfileBtn, BorderLayout.EAST);

        mainPanel.add(topPanel, BorderLayout.NORTH);

        // Center: Profile Grid
        profilesPanel = new JPanel(new WrapLayout(FlowLayout.LEFT, 20, 20));
        JScrollPane scrollPane = new JScrollPane(profilesPanel);
        scrollPane.setBorder(null);
        scrollPane.getVerticalScrollBar().setUnitIncrement(16);
        mainPanel.add(scrollPane, BorderLayout.CENTER);

        // Bottom: Console and Launch
        JPanel bottomPanel = new JPanel(new BorderLayout(10, 10));
        bottomPanel.setPreferredSize(new Dimension(1000, 200));

        consoleArea = new JTextArea();
        consoleArea.setEditable(false);
        consoleArea.setFont(new Font("Consolas", Font.PLAIN, 12));
        JScrollPane consoleScroll = new JScrollPane(consoleArea);
        bottomPanel.add(consoleScroll, BorderLayout.CENTER);

        JPanel actionPanel = new JPanel(new FlowLayout(FlowLayout.CENTER, 20, 10)); // Container for buttons

        JButton settingsBtn = new JButton("Settings");
        settingsBtn.setFont(new Font("Segoe UI", Font.BOLD, 14));
        settingsBtn.setPreferredSize(new Dimension(150, 50));
        settingsBtn.addActionListener(e -> openSettings());
        actionPanel.add(settingsBtn);

        JButton launchBtn = new JButton("LAUNCH SELECTED PROFILE");
        launchBtn.setFont(new Font("Segoe UI", Font.BOLD, 18));
        launchBtn.setBackground(new Color(76, 175, 80));
        launchBtn.setForeground(Color.WHITE);
        launchBtn.setFocusPainted(false);
        launchBtn.setPreferredSize(new Dimension(300, 50));
        launchBtn.addActionListener(e -> launch());
        actionPanel.add(launchBtn);

        bottomPanel.add(actionPanel, BorderLayout.SOUTH);

        mainPanel.add(bottomPanel, BorderLayout.SOUTH);

        add(mainPanel);
    }

    private void loadProfiles() {
        profilesPanel.removeAll();
        List<Profile> profiles = profileManager.getProfiles();

        for (Profile p : profiles) {
            JPanel profileBtn = createProfileButton(p);
            profilesPanel.add(profileBtn);
        }

        profilesPanel.revalidate();
        profilesPanel.repaint();
    }

    private JPanel createProfileButton(Profile p) {
        // Using a JPanel instead of JButton for complex layout with multiple
        // interactive elements
        JPanel panel = new JPanel(new BorderLayout());
        panel.setPreferredSize(new Dimension(160, 160));
        panel.setBorder(BorderFactory.createLineBorder(new Color(60, 60, 60), 1));
        panel.setBackground(new Color(45, 48, 50));

        // Main Launch/Select Action Wrapper
        JButton selectBtn = new JButton();
        selectBtn.setLayout(new BorderLayout());
        selectBtn.setBorderPainted(false);
        selectBtn.setContentAreaFilled(false);
        selectBtn.setFocusPainted(false);

        JLabel iconLabel = new JLabel("Box", SwingConstants.CENTER);
        iconLabel.setFont(new Font("Segoe UI", Font.PLAIN, 12));
        iconLabel.setForeground(Color.LIGHT_GRAY);
        selectBtn.add(iconLabel, BorderLayout.CENTER);

        JLabel nameLabel = new JLabel(p.getName(), SwingConstants.CENTER);
        nameLabel.setFont(new Font("Segoe UI", Font.BOLD, 14));
        nameLabel.setForeground(Color.WHITE);
        selectBtn.add(nameLabel, BorderLayout.SOUTH);

        selectBtn.addActionListener(e -> {
            selectedProfile = p;
            log("Selected profile: " + p.getName() + " (" + p.getVersion() + ")");
            // Visual feedback could be added here (e.g. changing border color of 'panel')
        });

        panel.add(selectBtn, BorderLayout.CENTER);

        // Delete Button (Small, Top Right)
        JButton deleteBtn = new JButton("X");
        deleteBtn.setFont(new Font("Segoe UI", Font.BOLD, 10));
        deleteBtn.setForeground(Color.RED);
        deleteBtn.setPreferredSize(new Dimension(20, 20));
        deleteBtn.setMargin(new Insets(0, 0, 0, 0));
        deleteBtn.addActionListener(e -> {
            int confirm = JOptionPane.showConfirmDialog(this,
                    "Are you sure you want to delete profile '" + p.getName() + "'?",
                    "Delete Profile", JOptionPane.YES_NO_OPTION);
            if (confirm == JOptionPane.YES_OPTION) {
                profileManager.removeProfile(p);
                if (selectedProfile == p)
                    selectedProfile = null;
                loadProfiles();
            }
        });

        JPanel topPanel = new JPanel(new FlowLayout(FlowLayout.RIGHT, 0, 0));
        topPanel.setOpaque(false);
        topPanel.add(deleteBtn);

        // Use OverlayLayout or just add to North for simplicity,
        // but North would push the content down.
        // Let's put it in the panel's North for now.
        panel.add(topPanel, BorderLayout.NORTH);

        return panel;
    }

    private void addProfile() {
        AddProfileDialog dialog = new AddProfileDialog(this, versionManager);
        dialog.setVisible(true);

        if (dialog.isConfirmed()) {
            Profile p = dialog.getProfile();
            profileManager.addProfile(p);
            loadProfiles();
            // Auto install
            installProfile(p);
        }
    }

    private void openSettings() {
        if (selectedProfile == null) {
            JOptionPane.showMessageDialog(this, "Please select a profile first!");
            return;
        }

        ProfileSettingsDialog dialog = new ProfileSettingsDialog(this, selectedProfile);
        dialog.setVisible(true);

        if (dialog.isSaved()) {
            profileManager.saveProfiles();
            log("Settings saved for profile: " + selectedProfile.getName());
        }
    }

    private void installProfile(Profile p) {
        log("Auto-installing profile: " + p.getName() + "...");
        new Thread(() -> {
            resolveAndDownload(p, false);
        }).start();
    }

    private void launch() {
        if (selectedProfile == null) {
            JOptionPane.showMessageDialog(this, "Please select a profile first!");
            return;
        }

        Profile p = selectedProfile;
        log("Preparing to launch " + p.getName() + " (" + p.getVersion() + ", " + p.getModLoader() + ")...");

        new Thread(() -> {
            resolveAndDownload(p, true);
        }).start();
    }

    private void resolveAndDownload(Profile p, boolean launchAfter) {
        String modLoader = p.getModLoader();
        String mcVer = p.getVersion();
        String loaderVer = p.getLoaderVersion();

        if ("fabric".equalsIgnoreCase(modLoader)) {
            if (loaderVer != null && !loaderVer.isEmpty()) {
                String versionId = "fabric-loader-" + loaderVer + "-" + mcVer;
                log((launchAfter ? "Launching" : "Installing") + " explicit Fabric version: " + versionId);
                downloadAndInstall(p, versionId, launchAfter);
            } else {
                log("Resolving latest Fabric version for " + mcVer + "...");
                versionManager.resolveFabricVersion(mcVer,
                        new org.to2mbn.jmccc.mcdownloader.download.concurrent.CallbackAdapter<String>() {
                            @Override
                            public void done(String resolvedVersion) {
                                downloadAndInstall(p, resolvedVersion, launchAfter);
                            }

                            @Override
                            public void failed(Throwable e) {
                                log("Failed to resolve Fabric: " + e.getMessage());
                            }
                        });
            }
        } else if ("forge".equalsIgnoreCase(modLoader)) {
            if (loaderVer != null && !loaderVer.isEmpty()) {
                String versionId = mcVer + "-forge-" + loaderVer;
                log((launchAfter ? "Launching" : "Installing") + " Forge version: " + versionId);
                downloadAndInstall(p, versionId, launchAfter);
            } else {
                log("Error: Forge profile missing loader version!");
                if (launchAfter)
                    SwingUtilities.invokeLater(() -> JOptionPane.showMessageDialog(MainFrame.this,
                            "Forge profile is missing loader version."));
            }
        } else {
            downloadAndInstall(p, mcVer, launchAfter);
        }
    }

    private void downloadAndInstall(Profile p, String versionId, boolean launchAfter) {
        log("Checking game files for " + versionId + "...");
        versionManager.downloadVersion(versionId, new File(p.getGameDir()),
                new org.to2mbn.jmccc.mcdownloader.download.concurrent.DownloadCallback<org.to2mbn.jmccc.version.Version>() {
                    @Override
                    public void done(org.to2mbn.jmccc.version.Version v) {
                        log("Files ready.");
                        if (launchAfter) {
                            log("Launching...");
                            try {
                                launcherEngine.launch(p, versionId);
                            } catch (Exception e) {
                                e.printStackTrace();
                                log("Launch Error: " + e.getMessage());
                            }
                        } else {
                            log("Installation complete for " + p.getName());
                            SwingUtilities.invokeLater(() -> JOptionPane.showMessageDialog(MainFrame.this,
                                    "Installation complete for " + p.getName()));
                        }
                    }

                    @Override
                    public void failed(Throwable e) {
                        log("Download/Install failed: " + e.getMessage());
                        e.printStackTrace();
                    }

                    @Override
                    public void cancelled() {
                        log("Download cancelled");
                    }

                    @Override
                    public void updateProgress(long done, long total) {
                    }

                    @Override
                    public void retry(Throwable e, int current, int max) {
                    }
                });
    }

    public void log(String msg) {
        SwingUtilities.invokeLater(() -> consoleArea.append(msg + "\n"));
    }

    public static void main(String[] args) {
        try {
            UIManager.setLookAndFeel(new FlatDarkLaf());
        } catch (Exception ex) {
            System.err.println("Failed to initialize LaF");
        }
        SwingUtilities.invokeLater(() -> new MainFrame().setVisible(true));
    }
}
