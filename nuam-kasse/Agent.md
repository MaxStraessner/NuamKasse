# AGENTS.md — nuam-kasse

## Project instructions

These instructions are mandatory for all work inside the `nuam-kasse` project.

Always work only inside this repository and its Docker Compose project.

Do not modify files, containers, networks, volumes, ports, services, or configuration belonging to other projects unless the user explicitly requests it.

---

# Docker environment

This project runs using Docker Compose.

Current Docker setup:

## Frontend

- Compose service: `frontend`
- Current container: `frontend-1`
- Host port: `8080`
- Container port: `80`
- Application URL: `http://localhost:8080`

Port mapping:

```text
8080:80
```

## Backend

- Compose service: `backend`
- Current container: `backend-1`
- Host port: `8000`
- Container port: `8000`
- Backend/API URL: `http://localhost:8000`

Port mapping:

```text
8000:8000
```

## Database

- Compose service: `db`
- Current container: `db-1`
- Database: PostgreSQL 16 Alpine
- The database is currently internal to the Docker Compose network.
- Do not expose a PostgreSQL host port unless explicitly requested by the user.

---

# Existing ports are fixed

The existing Docker port mappings are mandatory and must not be changed automatically.

The following mappings must remain unchanged:

```text
Frontend: 8080:80
Backend:  8000:8000
```

Never automatically switch to another port.

Forbidden examples:

```text
8080 -> 8081
8000 -> 8001
3000 -> 3001
5173 -> 5174
```

Do not change application ports, Docker ports, proxy ports, frontend ports, backend ports, or environment variables merely because a configured port is occupied.

If a required port is already occupied:

1. Determine which process or container is using the port.
2. Determine whether it belongs to `nuam-kasse`.
3. If it is an old or stale container from `nuam-kasse`, safely replace or restart it.
4. If another unrelated project owns the port, do not stop or modify that project automatically.
5. Report the port conflict to the user instead of changing the configured port.

Existing ports may only be changed if the user explicitly requests a port change.

---

# Mandatory workflow after every code change

Whenever implementing:

- a new feature
- a bug fix
- a frontend change
- a backend change
- an API change
- a UI change
- a refactoring
- a database-related application change
- configuration required by a feature

the task is not finished after editing the source code.

The updated version must also be deployed into the existing Docker environment.

After every functional code change:

1. Finish the implementation.
2. Run relevant tests if available.
3. Run linting if available.
4. Run type checking if available.
5. Run relevant build checks if available.
6. Determine which Docker service or services were affected.
7. Rebuild the affected Docker service when necessary.
8. Restart/update the affected service using Docker Compose.
9. Verify that the containers are running successfully.
10. Check relevant container logs for startup or runtime errors.
11. Smoke-test the changed functionality against the running Docker application whenever practical.
12. Keep all existing ports unchanged.

A task is not considered complete until the current code is running in Docker.

---

# Frontend workflow

For frontend changes, normally use:

```bash
docker compose build frontend
docker compose up -d frontend
```

Then verify:

```bash
docker compose ps
docker compose logs --tail=100 frontend
```

The frontend must remain reachable at:

```text
http://localhost:8080
```

Do not change port `8080`.

If the project uses bind mounts or another development setup where a rebuild is not necessary, use the existing project workflow instead, but still verify that the currently running frontend contains the new changes.

---

# Backend workflow

For backend changes, normally use:

```bash
docker compose build backend
docker compose up -d backend
```

Then verify:

```bash
docker compose ps
docker compose logs --tail=100 backend
```

The backend must remain reachable at:

```text
http://localhost:8000
```

Do not change port `8000`.

If the project uses bind mounts or another development setup where a rebuild is not necessary, use the existing project workflow instead, but still verify that the currently running backend contains the new changes.

---

# Frontend and backend changes

If a feature affects both frontend and backend, rebuild/update both affected services:

```bash
docker compose build frontend backend
docker compose up -d frontend backend
```

Then verify:

```bash
docker compose ps
docker compose logs --tail=100 frontend
docker compose logs --tail=100 backend
```

Do not unnecessarily recreate the database service.

---

# Docker Compose behavior

Always use the Docker Compose configuration that already exists in this repository.

Prefer:

```bash
docker compose ...
```

Do not create a second or competing Docker Compose setup unless explicitly requested.

Do not create duplicate replacement containers with different ports simply to make the application start.

Do not rename existing services unnecessarily.

Do not change established Docker networks, volumes, service names, environment conventions, or port mappings without a concrete reason required by the task.

Before making Docker-related changes, inspect the existing:

- `compose.yml`
- `compose.yaml`
- `docker-compose.yml`
- `docker-compose.yaml`
- Dockerfiles
- `.env`
- `.env.*`
- project scripts
- README
- existing configuration files

Only files that actually exist in the project need to be inspected.

Existing project configuration takes precedence over assumptions.

---

# Project isolation

Only operate on resources belonging to `nuam-kasse`.

Docker may contain containers from multiple projects.

Never stop, remove, rebuild, rename, or reconfigure containers belonging to another project just to make `nuam-kasse` work.

Do not use broad destructive Docker commands such as:

```bash
docker stop $(docker ps -q)
docker rm $(docker ps -aq)
docker system prune -a
docker volume prune
docker network prune
```

unless the user explicitly requests such an operation and the consequences are clear.

Prefer service-specific Docker Compose commands.

---

# Container names

Current observed containers are:

```text
frontend-1
backend-1
db-1
```

These are current runtime container names.

Prefer addressing services through Docker Compose service names:

```text
frontend
backend
db
```

rather than hard-coding generated container names when issuing normal project commands.

---

# Database rules

The PostgreSQL service is:

```text
db
```

Treat persistent database data as important.

Do not automatically:

- delete the database volume
- reset the database
- wipe existing data
- recreate the database from scratch
- run `docker compose down -v`
- remove persistent database volumes
- expose PostgreSQL on an additional host port
- drop databases
- drop schemas
- truncate important production-like data

unless explicitly required and approved by the user.

Database migrations required for a feature may be executed when appropriate.

When performing migrations:

1. Preserve existing data whenever possible.
2. Use the migration mechanism already present in the project.
3. Do not replace migrations with destructive database resets merely because it is easier.
4. Verify that the backend still starts successfully afterwards.

Before destructive database operations, ask the user first.

---

# Existing Docker environment should be reused

Do not create a parallel environment just to test a feature.

Use the existing `nuam-kasse` Docker Compose project.

The objective is that after development, the user can immediately open the already known application URLs and test the latest version.

The expected test URLs are:

```text
Frontend:
http://localhost:8080

Backend:
http://localhost:8000
```

Do not give the new feature a separate port.

Do not start temporary replacement application containers on alternative ports when the existing project containers can be rebuilt or restarted.

---

# Feature completion policy

When the user requests a new feature, automatically perform the complete workflow without requiring the user to separately ask for Docker deployment.

For example, when the user says:

```text
Add a customer search feature.
```

the expected workflow is automatically:

```text
Implement feature
-> run relevant checks
-> rebuild affected Docker service(s)
-> update running Docker container(s)
-> check container status
-> inspect logs
-> smoke-test feature
-> keep existing ports unchanged
```

The user should not need to say:

```text
Now put it into Docker.
```

Docker deployment of the latest project version is part of completing the development task.

---

# Error handling

If rebuilding or restarting Docker fails:

1. Investigate the actual error.
2. Check Docker Compose status.
3. Check logs of the affected service.
4. Fix project-related configuration or code issues when safe and within scope.
5. Retry the affected service.
6. Do not solve the problem by silently changing ports.
7. Do not solve the problem by modifying unrelated Docker projects.
8. Do not delete persistent database data as a shortcut.

If the problem requires a destructive operation or would affect another project, ask the user before proceeding.

---

# Verification

After updating Docker, always check the service state with an appropriate command such as:

```bash
docker compose ps
```

For frontend changes, check logs when relevant:

```bash
docker compose logs --tail=100 frontend
```

For backend changes, check logs when relevant:

```bash
docker compose logs --tail=100 backend
```

For database-related changes, check database logs when relevant:

```bash
docker compose logs --tail=100 db
```

Do not claim that Docker deployment succeeded without verifying that the affected service is running successfully.

---

# Smoke testing

Whenever practical, test the running application after deployment.

For frontend work, verify the application through:

```text
http://localhost:8080
```

For backend/API work, verify the application through:

```text
http://localhost:8000
```

If the backend exposes health checks, API documentation, automated tests, or other existing verification mechanisms, use them when appropriate.

Do not invent new ports or alternative URLs if the existing ones are expected to work.

---

# Definition of done

A feature, fix, or functional code change is complete only when all applicable items below are satisfied:

- The requested implementation is finished.
- Relevant tests have been run when available.
- Relevant linting/type/build checks have been run when available.
- The affected Docker service has been rebuilt when required.
- The affected Docker service has been restarted or updated.
- The current source code is actually running in Docker.
- Docker container status has been verified.
- Relevant Docker logs have been checked for errors.
- The frontend remains on `http://localhost:8080`.
- The backend remains on `http://localhost:8000`.
- Existing Docker ports have not changed.
- PostgreSQL data has not been destroyed.
- Unrelated Docker projects have not been modified.
- The changed functionality has been smoke-tested whenever practical.

Do not report a development task as complete before the applicable Docker deployment and verification steps have been performed.

---

# Completion response

When reporting that a development task is complete, briefly mention:

- what was changed
- which Docker service or services were rebuilt/restarted
- whether the containers are running successfully
- whether relevant checks passed
- where the user can test the result

For this project, normally provide the relevant URL:

```text
Frontend: http://localhost:8080
Backend:  http://localhost:8000
```

Do not tell the user to manually rebuild Docker if the necessary Docker commands can be performed as part of the task.

The goal is that after Codex finishes a feature, the latest version is already running and ready for the user to test.
