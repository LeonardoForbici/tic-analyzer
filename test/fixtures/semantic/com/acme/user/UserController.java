package com.acme.user;

public class UserController {
    private final UserService userService;

    public UserController(UserService userService) {
        this.userService = userService;
    }

    public String list() {
        return userService.findAll();
    }
}
