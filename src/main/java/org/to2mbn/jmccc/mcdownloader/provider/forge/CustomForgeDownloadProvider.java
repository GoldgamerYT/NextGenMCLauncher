package org.to2mbn.jmccc.mcdownloader.provider.forge;

import net.gamehost24.launcher.core.forge.CustomInstallProfileProcessor;
import org.to2mbn.jmccc.mcdownloader.download.combine.CombinedDownloadTask;
import org.to2mbn.jmccc.mcdownloader.provider.MinecraftDownloadProvider;
import org.to2mbn.jmccc.mcdownloader.provider.VersionJsonInstaller;
import org.to2mbn.jmccc.option.MinecraftDirectory;

public class CustomForgeDownloadProvider extends ForgeDownloadProvider {

    private MinecraftDownloadProvider upstreamProvider;

    @Override
    public void setUpstreamProvider(MinecraftDownloadProvider upstreamProvider) {
        super.setUpstreamProvider(upstreamProvider);
        this.upstreamProvider = upstreamProvider;
    }

    @Override
    public CombinedDownloadTask<String> gameVersionJson(final MinecraftDirectory mcdir, String version) {
        final ResolvedForgeVersion forgeInfo = ResolvedForgeVersion.resolve(version);

        if (forgeInfo != null) {
            return customForgeVersion(forgeInfo.getForgeVersion())
                    .andThenDownload(forge -> CombinedDownloadTask.any(
                            installerTask(forge.getMavenVersion())
                                    .andThen(new CustomInstallProfileProcessor(mcdir)),
                            upstreamProvider.gameVersionJson(mcdir, forge.getMinecraftVersion())
                                    .andThen(superversion -> createForgeVersionJson(mcdir, forge))
                                    .andThen(new VersionJsonInstaller(mcdir))));
        }

        return null;
    }

    private CombinedDownloadTask<ForgeVersion> customForgeVersion(final String forgeVersion) {
        return forgeVersionList()
                .andThen(versionList -> {
                    ForgeVersion forge = versionList.get(forgeVersion);
                    if (forge == null) {
                        throw new IllegalArgumentException("Forge version not found: " + forgeVersion);
                    }
                    return forge;
                });
    }
}
