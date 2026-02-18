# Running RedOpSync as a system service

The Docker Compose stack is configured with `restart: unless-stopped` so containers:

- Restart automatically if they exit or crash
- Start again after a host reboot (unless you stopped them with `docker compose stop`)

## Optional: systemd service (start on boot)

To have the whole stack start when the machine boots, install the systemd unit.

1. **Copy the unit file** and set the project path:

   ```bash
   sudo cp deploy/redopsync.service /etc/systemd/system/
   sudo sed -i 's|WorkingDirectory=.*|WorkingDirectory=/path/to/RedOpSync|' /etc/systemd/system/redopsync.service
   ```

   Replace `/path/to/RedOpSync` with the actual path to the project (e.g. `/opt/redopsync` or `/home/you/RedOpSync`).

2. **Reload systemd** and enable the service:

   ```bash
   sudo systemctl daemon-reload
   sudo systemctl enable redopsync.service
   ```

3. **Start the stack** (or reboot):

   ```bash
   sudo systemctl start redopsync
   ```

4. **Useful commands**:

   - `sudo systemctl status redopsync` — show status
   - `sudo systemctl stop redopsync` — bring down the stack
   - `sudo systemctl start redopsync` — bring up the stack
   - `sudo systemctl restart redopsync` — down then up

Note: The unit runs `docker compose up -d` and `docker compose down`. For logs and per-service control, use `docker compose` in the project directory as usual.
