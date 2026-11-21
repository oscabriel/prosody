# A request made by another site's page is refused

The tailnet vouches for a machine, not for what runs on it, so without a check any site open in a browser on one of your devices could read and keep places as that device. `/auth` refuses a request whose `Origin` names another host or whose `Sec-Fetch-Site` says it came from elsewhere; only a link followed to a page is let through.
