package net.gamehost24.launcher.ui;

import net.gamehost24.launcher.model.Profile;

import javax.swing.*;
import javax.swing.event.ChangeEvent;
import javax.swing.event.ChangeListener;
import java.awt.*;
import java.io.File;
import java.lang.management.ManagementFactory;

public class ProfileSettingsDialog extends JDialog {

    private Profile profile;
    private boolean saved = false;

    private JLabel ramValueLabel;
    private JSlider ramSlider;
    private JTextField ramField; // Read-only or editable linked to slider

    public ProfileSettingsDialog(Frame owner, Profile profile) {
        super(owner, "Profile Settings - " + profile.getName(), true);
        this.profile = profile;
        setSize(500, 400);
        setLocationRelativeTo(owner);
        setLayout(new BorderLayout());

        initComponents();
    }

    private void initComponents() {
        JPanel mainPanel = new JPanel(new GridBagLayout());
        mainPanel.setBorder(BorderFactory.createEmptyBorder(20, 20, 20, 20));
        GridBagConstraints gbc = new GridBagConstraints();
        gbc.fill = GridBagConstraints.HORIZONTAL;
        gbc.insets = new Insets(10, 10, 10, 10);
        gbc.weightx = 1.0;

        // -- RAM Settings --
        gbc.gridx = 0;
        gbc.gridy = 0;
        mainPanel.add(new JLabel("Memory Allocation (RAM):"), gbc);

        // Calculate Max RAM
        long totalRamBytes = 0;
        try {
            // Attempt to get system physical memory
            java.lang.management.OperatingSystemMXBean osBean = ManagementFactory.getOperatingSystemMXBean();
            if (osBean instanceof com.sun.management.OperatingSystemMXBean) {
                totalRamBytes = ((com.sun.management.OperatingSystemMXBean) osBean).getTotalMemorySize();
            }
        } catch (Exception e) {
            e.printStackTrace();
        }

        // Default max 16GB if detection fails, or use detected value
        int maxRamMb = (totalRamBytes > 0) ? (int) (totalRamBytes / (1024 * 1024)) : 16384;
        // Cap at 64GB to be safe/sane if server has huge RAM
        if (maxRamMb > 65536)
            maxRamMb = 65536;

        int currentRam = profile.getRamMb();
        if (currentRam < 2048)
            currentRam = 2048; // Ensure at least 2GB per req

        // Slider: Min 2048 (2GB), Max: maxRamMb
        ramSlider = new JSlider(2048, maxRamMb, currentRam);
        ramSlider.setMajorTickSpacing(1024);
        ramSlider.setMinorTickSpacing(256); // 256MB steps?
        // ramSlider.setPaintTicks(true);
        // Paint ticks might be too dense for large RAM.

        ramValueLabel = new JLabel(currentRam + " MB");
        ramValueLabel.setFont(new Font("Segoe UI", Font.BOLD, 14));
        ramValueLabel.setHorizontalAlignment(SwingConstants.RIGHT);

        ramSlider.addChangeListener(e -> {
            ramValueLabel.setText(ramSlider.getValue() + " MB");
        });

        gbc.gridx = 0;
        gbc.gridy = 1;
        mainPanel.add(ramSlider, gbc);

        gbc.gridx = 0;
        gbc.gridy = 2;
        mainPanel.add(ramValueLabel, gbc);

        // -- Open Mods Folder --
        gbc.gridx = 0;
        gbc.gridy = 3;
        mainPanel.add(new JSeparator(), gbc);

        gbc.gridx = 0;
        gbc.gridy = 4;
        JButton openModsBtn = new JButton("Open Mods Folder");
        openModsBtn.setFont(new Font("Segoe UI", Font.PLAIN, 14));
        openModsBtn.addActionListener(e -> openModsFolder());
        mainPanel.add(openModsBtn, gbc);

        // -- Actions --
        add(mainPanel, BorderLayout.CENTER);

        JPanel btnPanel = new JPanel(new FlowLayout(FlowLayout.RIGHT));
        JButton saveBtn = new JButton("Save Profile");
        saveBtn.setBackground(new Color(60, 120, 180));
        saveBtn.setForeground(Color.WHITE);
        saveBtn.addActionListener(e -> save());

        JButton cancelBtn = new JButton("Cancel");
        cancelBtn.addActionListener(e -> dispose());

        btnPanel.add(cancelBtn);
        btnPanel.add(saveBtn);
        add(btnPanel, BorderLayout.SOUTH);
    }

    private void openModsFolder() {
        try {
            // Constructs path: base -> instances -> profile -> mods
            // Assumes profile.getGameDir() is relative or absolute.
            // profile.getGameDir() usually "instances/Name"

            File gameDir = new File(profile.getGameDir());
            File modsDir = new File(gameDir, "mods");

            if (!modsDir.exists()) {
                boolean created = modsDir.mkdirs();
                if (!created && !modsDir.exists()) {
                    JOptionPane.showMessageDialog(this,
                            "Could not create mods directory at: " + modsDir.getAbsolutePath());
                    return;
                }
            }

            if (Desktop.isDesktopSupported()) {
                Desktop.getDesktop().open(modsDir);
            } else {
                // Fallback for Windows if Desktop not supported
                if (System.getProperty("os.name").toLowerCase().contains("win")) {
                    Runtime.getRuntime().exec("explorer.exe " + modsDir.getAbsolutePath());
                } else {
                    JOptionPane.showMessageDialog(this, "Opening folders not supported on this platform.");
                }
            }
        } catch (Exception e) {
            e.printStackTrace();
            JOptionPane.showMessageDialog(this, "Error opening folder: " + e.getMessage());
        }
    }

    private void save() {
        profile.setRamMb(ramSlider.getValue());
        saved = true;
        dispose();
    }

    public boolean isSaved() {
        return saved;
    }
}
