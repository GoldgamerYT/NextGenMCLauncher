package net.gamehost24.launcher.ui;

import net.gamehost24.launcher.core.VersionManager;
import net.gamehost24.launcher.model.Profile;
import org.to2mbn.jmccc.mcdownloader.RemoteVersionList;
import org.to2mbn.jmccc.mcdownloader.download.concurrent.DownloadCallback;

import javax.swing.*;
import java.awt.*;
import java.io.File;
import java.util.List;

public class AddProfileDialog extends JDialog {

    private boolean confirmed = false;
    private Profile profile;
    private VersionManager versionManager;

    private JTextField nameField;
    private JComboBox<String> versionSelector;
    private JComboBox<String> modLoaderSelector;
    private JComboBox<String> loaderVersionSelector;
    private JLabel loaderVersionLabel;
    private JTextField ramField;
    private JTextField javaField;
    private JTextField iconField; // For now text path, later file chooser

    public AddProfileDialog(Frame owner, VersionManager versionManager) {
        super(owner, "Create New Profile", true);
        this.versionManager = versionManager;

        setSize(400, 500); // Increased height for new field
        setLocationRelativeTo(owner);
        setLayout(new BorderLayout());

        initComponents();
        fetchVersions();
    }

    private void initComponents() {
        JPanel formPanel = new JPanel(new GridBagLayout());
        formPanel.setBorder(BorderFactory.createEmptyBorder(10, 10, 10, 10));
        GridBagConstraints gbc = new GridBagConstraints();
        gbc.fill = GridBagConstraints.HORIZONTAL;
        gbc.insets = new Insets(5, 5, 5, 5);

        // 1. Name
        gbc.gridx = 0;
        gbc.gridy = 0;
        formPanel.add(new JLabel("Name:"), gbc);
        gbc.gridx = 1;
        nameField = new JTextField();
        formPanel.add(nameField, gbc);

        // 2. ModLoader (Moved to Top)
        gbc.gridx = 0;
        gbc.gridy = 1;
        formPanel.add(new JLabel("ModLoader:"), gbc);
        gbc.gridx = 1;
        modLoaderSelector = new JComboBox<>(new String[] { "Vanilla", "Fabric", "Forge", "NeoForge" });
        modLoaderSelector.addActionListener(e -> onModLoaderChanged());
        formPanel.add(modLoaderSelector, gbc);

        // 3. Game Version
        gbc.gridx = 0;
        gbc.gridy = 2;
        formPanel.add(new JLabel("Game Version:"), gbc);
        gbc.gridx = 1;
        versionSelector = new JComboBox<>();
        versionSelector.addActionListener(e -> onGameVersionChanged());
        formPanel.add(versionSelector, gbc);

        // 4. Loader Version (Dynamic)
        gbc.gridx = 0;
        gbc.gridy = 3;
        loaderVersionLabel = new JLabel("Loader Version:");
        loaderVersionLabel.setVisible(false);
        formPanel.add(loaderVersionLabel, gbc);

        gbc.gridx = 1;
        loaderVersionSelector = new JComboBox<>();
        loaderVersionSelector.setVisible(false);
        formPanel.add(loaderVersionSelector, gbc);

        // 5. RAM
        gbc.gridx = 0;
        gbc.gridy = 4;
        formPanel.add(new JLabel("RAM (MB):"), gbc);
        gbc.gridx = 1;
        ramField = new JTextField("2048");
        formPanel.add(ramField, gbc);

        // 6. Java Path
        gbc.gridx = 0;
        gbc.gridy = 5;
        formPanel.add(new JLabel("Java Path:"), gbc);
        gbc.gridx = 1;
        String defaultJava = System.getProperty("java.home") + File.separator + "bin" + File.separator + "java";
        if (System.getProperty("os.name").toLowerCase().contains("win")) {
            defaultJava += ".exe";
        }
        javaField = new JTextField(defaultJava);
        formPanel.add(javaField, gbc);

        // 7. Icon
        gbc.gridx = 0;
        gbc.gridy = 6;
        formPanel.add(new JLabel("Icon Check (Optional):"), gbc);
        gbc.gridx = 1;
        iconField = new JTextField();
        formPanel.add(iconField, gbc);

        add(formPanel, BorderLayout.CENTER);

        // Buttons
        JPanel btnPanel = new JPanel(new FlowLayout(FlowLayout.RIGHT));
        JButton cancelBtn = new JButton("Cancel");
        cancelBtn.addActionListener(e -> dispose());

        JButton createBtn = new JButton("Create");
        createBtn.addActionListener(e -> createProfile());

        btnPanel.add(cancelBtn);
        btnPanel.add(createBtn);
        add(btnPanel, BorderLayout.SOUTH);
    }

    private void onModLoaderChanged() {
        String loader = (String) modLoaderSelector.getSelectedItem();
        boolean isVanilla = "Vanilla".equals(loader);

        loaderVersionLabel.setVisible(!isVanilla);
        loaderVersionSelector.setVisible(!isVanilla);

        if (!isVanilla) {
            fetchLoaderVersions();
        }

        // Repaint to ensure layout updates for visibility changes
        revalidate();
        repaint();
    }

    private void onGameVersionChanged() {
        if (!"Vanilla".equals(modLoaderSelector.getSelectedItem())) {
            fetchLoaderVersions();
        }
    }

    private void fetchVersions() {
        versionSelector.removeAllItems();
        versionSelector.addItem("Loading...");

        versionManager.fetchVersions(new DownloadCallback<RemoteVersionList>() {
            @Override
            public void done(RemoteVersionList result) {
                SwingUtilities.invokeLater(() -> {
                    versionSelector.removeAllItems();
                    for (String v : result.getVersions().keySet()) {
                        versionSelector.addItem(v);
                    }
                    if (versionSelector.getItemCount() > 0) {
                        versionSelector.setSelectedIndex(0);
                    }
                });
            }

            @Override
            public void failed(Throwable e) {
                SwingUtilities.invokeLater(() -> {
                    versionSelector.removeAllItems();
                    versionSelector.addItem("Error fetching versions");
                });
            }

            @Override
            public void cancelled() {
            }

            @Override
            public void updateProgress(long done, long total) {
            }

            @Override
            public void retry(Throwable e, int current, int max) {
            }
        });
    }

    private void fetchLoaderVersions() {
        String gameVersion = (String) versionSelector.getSelectedItem();
        String loader = (String) modLoaderSelector.getSelectedItem();

        if (gameVersion == null || "Loading...".equals(gameVersion) || "Error fetching versions".equals(gameVersion)) {
            return;
        }

        loaderVersionSelector.removeAllItems();
        loaderVersionSelector.addItem("Loading...");

        DownloadCallback<List<String>> callback = new DownloadCallback<List<String>>() {
            @Override
            public void done(List<String> result) {
                SwingUtilities.invokeLater(() -> {
                    loaderVersionSelector.removeAllItems();
                    if (result.isEmpty()) {
                        loaderVersionSelector.addItem("No versions found");
                    } else {
                        for (String v : result) {
                            loaderVersionSelector.addItem(v);
                        }
                    }
                });
            }

            @Override
            public void failed(Throwable e) {
                SwingUtilities.invokeLater(() -> {
                    loaderVersionSelector.removeAllItems();
                    loaderVersionSelector.addItem("Error: " + e.getMessage());
                });
            }

            @Override
            public void cancelled() {
            }

            @Override
            public void updateProgress(long d, long t) {
            }

            @Override
            public void retry(Throwable e, int c, int m) {
            }
        };

        if ("Fabric".equals(loader)) {
            versionManager.fetchFabricLoaderVersions(gameVersion, callback);
        } else if ("Forge".equals(loader)) {
            versionManager.fetchForgeVersions(gameVersion, callback);
        } else if ("NeoForge".equals(loader)) {
            // Placeholder: NeoForge likely compatible with Forge provider structure or
            // needs new one.
            // For now, treat as error or explicit non-support
            SwingUtilities.invokeLater(() -> {
                loaderVersionSelector.removeAllItems();
                loaderVersionSelector.addItem("NeoForge not yet implemented");
            });
        }
    }

    private void createProfile() {
        String name = nameField.getText();
        if (name.isEmpty()) {
            JOptionPane.showMessageDialog(this, "Name is required");
            return;
        }
        String version = (String) versionSelector.getSelectedItem();
        String loader = (String) modLoaderSelector.getSelectedItem();

        String loaderVer = null;
        if (!"Vanilla".equals(loader)) {
            loaderVer = (String) loaderVersionSelector.getSelectedItem();
            if (loaderVer == null || loaderVer.startsWith("Loading") || loaderVer.startsWith("Error")) {
                JOptionPane.showMessageDialog(this, "Please select a valid Loader Version");
                return;
            }
        }

        int ram = 2048;
        try {
            ram = Integer.parseInt(ramField.getText());
        } catch (NumberFormatException e) {
            JOptionPane.showMessageDialog(this, "Invalid RAM amount");
            return;
        }

        String java = javaField.getText();
        String gameDir = "instances/" + name;
        String icon = iconField.getText();

        profile = new Profile(name, version, loader.toLowerCase(), ram, java, gameDir, icon);
        if (loaderVer != null) {
            profile.setLoaderVersion(loaderVer);
        }

        confirmed = true;
        dispose();
    }

    public boolean isConfirmed() {
        return confirmed;
    }

    public Profile getProfile() {
        return profile;
    }
}
