# Academy routes are owned by domain flows

`AcademyApp` owns application lifetime, shell wiring, checkpoint persistence, and
theme/navigation dispatch only. Enrollment routes belong to `EnrollmentFlow`;
campus, review, journal, and lab routes belong to `WorldFlow`; append-only
learning mutations belong to `LearnerEvidence`.

We reject a single route switch that also knows access exchange, placement,
grading, SRS scheduling, bond milestones, media playback, and journal rendering.
That shape already exceeded the project's 300-line orchestrator target during
the enrollment slice and would become an Academy god-object as Weeks are added.

Each flow receives the same small `AcademyRouteContext`: current language,
checkpoint, learner projection, shell, and one `go` transition. A flow may
render only its own routes. It records durable changes through deep domain
interfaces rather than mutating checkpoint or DOM state outside its ownership.
