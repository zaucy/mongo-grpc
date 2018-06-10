package(default_visibility = ["//visibility:public"])

load("@com_github_grpc_grpc//bazel:cc_grpc_library.bzl", "cc_grpc_library")

cc_grpc_library(
  name = "cc_bson_pb",
  srcs = ["bson.proto"],
  proto_only = True,
  well_known_protos = False,
  use_external = True,
  deps = [],
)

cc_grpc_library(
  name = "cc_mongo_grpc_pb",
  srcs = ["mongo.proto"],
  proto_only = False,
  well_known_protos = False,
  use_external = True,
  deps = [
    ":cc_bson_pb"
  ],
)
