package org.keycloak.services.resources.admin;

import jakarta.ws.rs.Path;

@Path("/admin")
public class AdminRoot {
    @Path("realms")
    public RealmsAdminResource getRealmsAdmin() {
        return new RealmsAdminResource();
    }
}
