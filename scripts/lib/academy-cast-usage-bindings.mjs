export function reconcileAcademyLessonCastBindings(usage, manifest) {
    const assetsById = new Map(usage.assets.map(asset => [asset.id, asset]));
    const assetsByDelivery = new Map(
        usage.assets.flatMap(asset =>
            (asset.deliveries ?? []).map(delivery => [delivery.path, asset]),
        ),
    );

    for (const binding of usage.lessonBindings ?? []) {
        reconcileBindingMap(binding.approvedCastAssetIds, 'approved', binding.packageId);
        reconcileBindingMap(binding.reviewOnlyCastCandidates, 'review-preview', binding.packageId);
    }

    function reconcileBindingMap(bindingMap, requiredStatus, packageId) {
        for (const [castId, currentAssetId] of Object.entries(bindingMap ?? {})) {
            if (assetsById.has(currentAssetId)) continue;
            const slot = manifest.find(candidate =>
                candidate.castId === castId
                && candidate.expression === 'neutral'
                && candidate.status === requiredStatus,
            );
            const replacement = slot ? assetsByDelivery.get(slot.assetPath) : undefined;
            if (!replacement) {
                throw new Error(
                    `${packageId}:${castId} cannot reconcile missing cast asset ${currentAssetId}.`,
                );
            }
            bindingMap[castId] = replacement.id;
        }
    }
}
