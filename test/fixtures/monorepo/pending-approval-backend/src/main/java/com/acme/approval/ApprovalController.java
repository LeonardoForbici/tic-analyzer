package com.acme.approval;

public class ApprovalController {
    private final ApprovalService approvalService;

    public ApprovalController(ApprovalService approvalService) {
        this.approvalService = approvalService;
    }

    @PostMapping("/api/approvals")
    public String approve(String body) {
        return approvalService.approve(body);
    }
}
