#!/usr/bin/env bats

load test_helper

# --- Rollout ---

@test "service-a: rollout completes successfully" {
  run wait_for_rollout service-a
  [ "$status" -eq 0 ]
}

@test "service-b: rollout completes successfully" {
  run wait_for_rollout service-b
  [ "$status" -eq 0 ]
}

# --- Replicas ---

@test "service-a: all replicas are ready" {
  ready=$(get_ready_replicas service-a)
  desired=$(get_desired_replicas service-a)
  [ "$ready" -eq "$desired" ]
}

@test "service-b: all replicas are ready" {
  ready=$(get_ready_replicas service-b)
  desired=$(get_desired_replicas service-b)
  [ "$ready" -eq "$desired" ]
}

# --- Pod health ---

@test "service-a: pods are in Running state" {
  run kubectl get pods -l app=service-a -n "$NAMESPACE" -o jsonpath='{.items[*].status.phase}'
  [ "$status" -eq 0 ]
  [[ ! "$output" =~ "Pending" ]]
  [[ ! "$output" =~ "CrashLoopBackOff" ]]
  [[ "$output" =~ "Running" ]]
}

@test "service-b: pods are in Running state" {
  run kubectl get pods -l app=service-b -n "$NAMESPACE" -o jsonpath='{.items[*].status.phase}'
  [ "$status" -eq 0 ]
  [[ ! "$output" =~ "Pending" ]]
  [[ ! "$output" =~ "CrashLoopBackOff" ]]
  [[ "$output" =~ "Running" ]]
}

# --- Resource limits ---

@test "service-a: has resource limits configured" {
  run kubectl get deployment service-a -n "$NAMESPACE" -o jsonpath='{.spec.template.spec.containers[0].resources.limits.cpu}'
  [ "$status" -eq 0 ]
  [ -n "$output" ]
}

@test "service-b: has resource limits configured" {
  run kubectl get deployment service-b -n "$NAMESPACE" -o jsonpath='{.spec.template.spec.containers[0].resources.limits.cpu}'
  [ "$status" -eq 0 ]
  [ -n "$output" ]
}

# --- No restarts ---

@test "service-a: pods have zero restarts" {
  restarts=$(kubectl get pods -l app=service-a -n "$NAMESPACE" -o jsonpath='{.items[*].status.containerStatuses[0].restartCount}')
  for count in $restarts; do
    [ "$count" -eq 0 ]
  done
}

@test "service-b: pods have zero restarts" {
  restarts=$(kubectl get pods -l app=service-b -n "$NAMESPACE" -o jsonpath='{.items[*].status.containerStatuses[0].restartCount}')
  for count in $restarts; do
    [ "$count" -eq 0 ]
  done
}
