#!/usr/bin/env bash
#-----------------------------------------------
# This script will generate a JSON partial containing the
# current list of AMIs for use in different AWS regions.
#-----------------------------------------------
regions=( "us-east-1" "us-west-2" )

for region in "${regions[@]}" ; do
  printf "refreshing AMIs for $region region... " region

  # This is very slow so do it in PARALLEL
  windows_core=$(aws --region $region ec2 describe-images --owners amazon --filters "Name=platform,Values=windows" "Name=name,Values=Windows_Server-2012-R2_RTM-English-64Bit-Core-*" --query 'Images[*].{Name:Name,ID:ImageId,Date:CreationDate}' --output text | sort | tail -n 1 | cut -f 2)
  windows_base=$(aws --region $region ec2 describe-images --owners amazon --filters "Name=platform,Values=windows" "Name=name,Values=Windows_Server-2012-R2_RTM-English-64Bit-Base-*" --query 'Images[*].{Name:Name,ID:ImageId,Date:CreationDate}' --output text | sort | tail -n 1 | cut -f 2)
  linux_trusty=$(aws --region $region ec2 describe-images --owners 099720109477 --filters "Name=name,Values=ubuntu/images/hvm-ssd/ubuntu-trusty-14.04-amd64-server-*" --query 'Images[*]' --query 'Images[*].{Name:Name,ID:ImageId,Date:CreationDate}' --output text | sort | tail -n 1 | cut -f 2)
  linux_xenial=$(aws --region $region ec2 describe-images --owners 099720109477 --filters "Name=name,Values=ubuntu/images/hvm-ssd/ubuntu-xenial-16.04-amd64-server-*" --query 'Images[*]' --query 'Images[*].{Name:Name,ID:ImageId,Date:CreationDate}' --output text | sort | tail -n 1 | cut -f 2)
  linux_amazon=$(aws --region $region ec2 describe-images --owners amazon --filters "Name=name,Values=amzn-ami-hvm-2016*-gp2" --query 'Images[*]' --query 'Images[*].{Name:Name,ID:ImageId,Date:CreationDate}' --output text | sort | tail -n 1 | cut -f 2)

  # Wait for all the background processes to finish
  wait

  # Output pretty JSON ready to be copy & pasted into the globals.json file
  printf '{\n' > "${PWD}/blueprints/common/AMIs.${region}.json"
  printf '  "windows_core" : "%s",\n' $windows_core >> "blueprints/common/AMIs.${region}.json"
  printf '  "windows_base" : "%s",\n' $windows_base >> "blueprints/common/AMIs.${region}.json"
  printf '  "linux_trusty" : "%s",\n' $linux_trusty >> "blueprints/common/AMIs.${region}.json"
  printf '  "linux_ubuntu" : "%s",\n' $linux_xenial >> "blueprints/common/AMIs.${region}.json"
  printf '  "linux_amazon" : "%s"\n' $linux_amazon >> "blueprints/common/AMIs.${region}.json"
  printf '}\n' >> "${PWD}/blueprints/common/AMIs.${region}.json"

  echo 'done!'
done
