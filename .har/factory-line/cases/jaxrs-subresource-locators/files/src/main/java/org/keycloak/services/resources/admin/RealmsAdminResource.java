package org.keycloak.services.resources.admin;

import jakarta.ws.rs.POST;
import jakarta.ws.rs.Path;
import jakarta.ws.rs.core.Response;

public class RealmsAdminResource {
    @POST
    public Response importRealm() {
        return null;
    }

    @Path("{realm}")
    public RealmAdminResource getRealmAdmin() {
        return new RealmAdminResource();
    }
}
