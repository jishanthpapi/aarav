# Files (16) runtime-check status

The requested runtime checks are represented by real test entry points. The default suite keeps the executing-GPU case opt-in, so ordinary CI does not claim hardware coverage. Run `node scripts/run-physical-tests.mjs` with `AARAV_EXECUTING_GPU=1` for the WebGPU test. The fallback browser runner performs 3,000 actual WebGL2 solver steps per case, checks every returned field for finite values, and checks renderer resource counts after teardown.

Control-surface geometry tests already pass for flap, rudder, aileron, and elevator mesh changes. Their aerodynamic force and moment signs still require the dedicated converged aircraft campaign; no pass is claimed from geometry-only tests.

