#!/usr/bin/env bash
#-----------------------------------------------
# This script will generate a JSON partial containing the
# current list of AMIs for use in different AWS regions.
#-----------------------------------------------
regions=( "us-east-1" "us-west-2" )

for region in "${regions[@]}" ; do
  printf "refreshing AMIs for $region region... " region

  # This is very slow so do it in PARALLEL
  win2012_core=$(aws --region $region ec2 describe-images --owners amazon --filters "Name=platform,Values=windows" "Name=name,Values=Windows_Server-2012-R2_RTM-English-64Bit-Core-*" --query 'Images[*].{Name:Name,ID:ImageId,Date:CreationDate}' --output text | sort | tail -n 1 | cut -f 2)
  win2012_base=$(aws --region $region ec2 describe-images --owners amazon --filters "Name=platform,Values=windows" "Name=name,Values=Windows_Server-2012-R2_RTM-English-64Bit-Base-*" --query 'Images[*].{Name:Name,ID:ImageId,Date:CreationDate}' --output text | sort | tail -n 1 | cut -f 2)
  win2016_full=$(aws --region $region ec2 describe-images --owners amazon --filters "Name=platform,Values=windows" "Name=name,Values=Windows_Server-2016-English-Full-Base-*" --query 'Images[*].{Name:Name,ID:ImageId,Date:CreationDate}' --output text | sort | tail -n 1 | cut -f 2)
  win2016_nano=$(aws --region $region ec2 describe-images --owners amazon --filters "Name=platform,Values=windows" "Name=name,Values=Windows_Server-2016-English-Nano-Base-*" --query 'Images[*].{Name:Name,ID:ImageId,Date:CreationDate}' --output text | sort | tail -n 1 | cut -f 2)
  linux_xenial=$(aws --region $region ec2 describe-images --owners 099720109477 --filters "Name=name,Values=ubuntu/images/hvm-ssd/ubuntu-xenial-16.04-amd64-server-*" --query 'Images[*]' --query 'Images[*].{Name:Name,ID:ImageId,Date:CreationDate}' --output text | sort | tail -n 1 | cut -f 2)
  linux_yakkety=$(aws --region $region ec2 describe-images --owners 099720109477 --filters "Name=name,Values=ubuntu/images/hvm-ssd/ubuntu-yakkety-16.10-amd64-server-*" --query 'Images[*]' --query 'Images[*].{Name:Name,ID:ImageId,Date:CreationDate}' --output text | sort | tail -n 1 | cut -f 2)
  linux_amazon=$(aws --region $region ec2 describe-images --owners amazon --filters "Name=name,Values=amzn-ami-hvm-2016*-gp2" --query 'Images[*]' --query 'Images[*].{Name:Name,ID:ImageId,Date:CreationDate}' --output text | sort | tail -n 1 | cut -f 2)

  # Wait for all the background processes to finish
  wait

  # Output pretty JSON ready to be copy & pasted into the globals.json file
  printf '{\n' > "${PWD}/blueprints/common/AMIs.${region}.json"
  printf '  "win2012_core": "%s",\n' $win2012_core  >> "blueprints/common/AMIs.${region}.json"
  printf '  "win2012_base": "%s",\n' $win2012_base  >> "blueprints/common/AMIs.${region}.json"
  printf '  "win2016_full": "%s",\n' $win2016_full  >> "blueprints/common/AMIs.${region}.json"
  printf '  "win2016_nano": "%s",\n' $win2016_nano  >> "blueprints/common/AMIs.${region}.json"
  printf '  "linux_amazon": "%s",\n' $linux_amazon  >> "blueprints/common/AMIs.${region}.json"
  printf '  "linux_ubults": "%s",\n' $linux_xenial  >> "blueprints/common/AMIs.${region}.json"
  printf '  "linux_ubuntu": "%s"\n'  $linux_yakkety >> "blueprints/common/AMIs.${region}.json"
  printf '}\n' >> "${PWD}/blueprints/common/AMIs.${region}.json"

  echo 'done!'
done
