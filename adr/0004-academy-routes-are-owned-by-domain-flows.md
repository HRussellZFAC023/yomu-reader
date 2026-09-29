# Academy routes have explicit owners

Reconsidered 18 September 2026. Keep explicit route and effect ownership; discard the arbitrary 300-line target and the assumption that the existing flow classes are the right final shape.

Application lifetime, navigation and lesson assessment must not require one class to understand every screen. A route owner controls its rendered screen, pending work, resume state and cleanup. Learning evidence is recorded through its durable owner, not inferred from navigation or duplicated in UI flags.

The current `AcademyRouteContext` exposes navigation, return and save operations as well as learner state. Its size and caller knowledge need review as part of the rewrite. Moving a large switch into several files is not sufficient; replacement modules must reduce coordination and pass route, disposal, resume and learning-evidence tests.
