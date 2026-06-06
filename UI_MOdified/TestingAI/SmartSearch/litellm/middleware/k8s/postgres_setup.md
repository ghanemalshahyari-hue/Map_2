# Database Setup for LiteLLM

Since you already have a Postgres server running as a pod, you need to execute into that pod and create the database and user for LiteLLM.

## Steps

1. Find the name of your existing postgres pod:
   ```bash
   kubectl get pods -n <your-namespace>
   ```

2. Execute into the postgres pod:
   ```bash
   kubectl exec -it <postgres-pod-name> -n <your-namespace> -- psql -U <your_existing_postgres_admin_user>
   ```
   *(e.g., `psql -U postgres`)*

3. Once inside the `psql` shell, run the following SQL commands to create the `litellm` user, database, and grant privileges:

   ```sql
   -- Create the user
   CREATE USER litellm WITH PASSWORD 'litellm';

   -- Create the database
   CREATE DATABASE litellm;

   -- Grant all privileges on the database to the user
   GRANT ALL PRIVILEGES ON DATABASE litellm TO litellm;
   ```

4. Exit the `psql` shell:
   ```sql
   \q
   ```

## Configuration Update

After setting up the database, you must update your `litellm_config.yaml` to point to this Postgres service instead of `localhost`.

Change:
`database_url: "postgresql://litellm:litellm@localhost:5432/litellm"`

To:
`database_url: "postgresql://litellm:litellm@<postgres-service-name>:5432/litellm"`
*(Replace `<postgres-service-name>` with the actual Kubernetes Service name for your Postgres pod).*
